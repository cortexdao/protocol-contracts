// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IAccountFactory.sol";
import "./interfaces/IAssetAllocationRegistry.sol";
import "./APYPoolTokenV2.sol";
import "./APYMetaPoolToken.sol";
import "./APYAccount.sol";

/**
 * @title APY Manager
 * @author APY.Finance
 * @notice This is the V2 of the manager logic contract for use with the
 * manager proxy contract.
 *
 *--------------------
 * MANAGING CAPITAL
 *--------------------
 * The APY Manager orchestrates the movement of capital within the APY system.
 * This movement of capital occurs in two major ways:
 *
 * - Capital transferred to and from APYPoolToken contracts and the
 *   APYAccount contract with the following functions:
 *
 *   - fundAccount
 *   - fundAndExecute
 *   - withdrawFromAccount
 *   - executeAndWithdraw
 *
 * - Capital routed to and from other protocols using generic execution with
 *   the following functions:
 *
 *   - execute
 *   - fundAndExecute
 *   - executeAndWithdraw
 *
 * Transferring from the APYPoolToken contracts to the Account contract stages
 * capital for deployment to yield farming strategies.  Capital unwound from
 * yield farming strategies for user withdrawals is transferred from the
 * Account contract to the APYPoolToken contracts.
 *
 * Routing capital to yield farming strategies using generic execution assumes
 * capital has been staged in the Account contract. Generic execution is also
 * used to unwind capital from yield farming strategies in preperation for
 * user withdrawal.
 *
 *--------------------
 * UPDATING TVL
 *--------------------
 * When the APY Manager routes capital using generic execution it can also
 * register an asset allocation with the AssetAllocationRegistry. Registering
 * asset allocations is important for Chainlink to calculate accurate TVL
 * values.
 *
 * The flexibility of generic execution means previously unused assets may be
 * acquired by the APYAccount contract, including those from providing
 * liquidity to a new protocol. These newly acquired assets and the manner
 * in which they are held in the system must be registered with the
 * AssetAllocationRegistry in order to be used in Chainlink's computation
 * of deployed TVL.
 *
 * Registration should not be done after generic execution as the TVL may
 * then be updated before the registered asset allocations are picked up by
 * Chainlink. Providing the option to register allocations atomically with
 * execution allows us to conveniently leverage generic execution while
 * avoiding late updates to the TVL.
 */
contract APYManager is Initializable, OwnableUpgradeSafe, IAccountFactory {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    APYMetaPoolToken public mApt;
    IAddressRegistry public addressRegistry;
    /// @notice Accounts store assets for strategies and interact with other protocols
    mapping(bytes32 => address) public override getAccount;
    bytes32[] internal _poolIds;

    /* ------------------------------- */

    event AdminChanged(address);
    event AccountDeployed(
        bytes32 accountId,
        address account,
        address generalExecutor
    );

    /**
     * @dev Since the proxy delegate calls to this "logic" contract, any
     * storage set by the logic contract's constructor during deploy is
     * disregarded and this function is needed to initialize the proxy
     * contract's storage according to this contract's layout.
     *
     * Since storage is not set yet, there is no simple way to protect
     * calling this function with owner modifiers.  Thus the OpenZeppelin
     * `initializer` modifier protects this function from being called
     * repeatedly.
     *
     * Our proxy deployment will call this as part of the constructor.
     */
    function initialize(
        address adminAddress,
        address payable _mApt,
        address _addressRegistry
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        mApt = APYMetaPoolToken(_mApt);
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    /**
     * @notice Initialize the new logic in V2 when upgrading from V1.
     * @dev The `onlyAdmin` modifier prevents this function from being called
     * multiple times, because the call has to come from the ProxyAdmin contract
     * and it can only call this during its `upgradeAndCall` function.
     *
     * Note the `initializer` modifier can only be used once in the entire
     * contract, so we can't use it here.
     */
    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    /**
     * @notice Create a new account to run strategies.
     * @dev Associates an APYGenericExecutor with the account. This executor
     * is used when the `execute` function is called for a specific account ID.
     * @param accountId ID identifying an address for execution
     * @param generalExecutor implementation contract for execution engine
     */
    function deployAccount(bytes32 accountId, address generalExecutor)
        external
        override
        onlyOwner
        returns (address)
    {
        APYAccount account = new APYAccount(generalExecutor);
        getAccount[accountId] = address(account);
        emit AccountDeployed(accountId, address(account), generalExecutor);
        return address(account);
    }

    /**
     * @notice Fund Account contract and register an asset allocation
     * @param accountId The Account contract ID
     * @param allocation Specifies the APYPoolToken contracts to pull from and
     * the amounts to pull.
     * See APYManager._fundAccount.
     * @param viewData The array of asset allocations to calculate the TVL of
     * new assets stored in the Account contract.
     * See APYManagerV2._registerAllocationData.
     */
    function fundAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        _registerAllocationData(viewData);
        _fundAccount(accountId, allocation);
    }

    /**
     * @notice Fund the Account contract and route capital to strategies
     * @param accountId The Account contract ID
     * @param allocation Specifies the APYPoolToken contracts to pull from and
     * the amounts to pull.
     * See APYManagerV2._fundAccount.
     * @param steps The generic execution sequence that will route capital
     * from the Account to yield farming strategies.
     * See APYManagerV2.execute.
     * @param viewData The array of asset allocations to calculate the TVL of
     * new assets stored in the Account contract.
     * See APYManagerV2._registerAllocationData.
     */
    function fundAndExecute(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        _registerAllocationData(viewData);
        _fundAccount(accountId, allocation);
        execute(accountId, steps, viewData);
    }

    /**
     * @notice Route capital in an Account contract to yield farming strategies
     * @param accountId The Account contract ID
     * @param steps The generic execution sequence that will route capital
     * from the Account to yield farming strategies.
     *
     * @notice Data[] example (adds DAI, USDC, and USDT to a Curve pool):
     *      [
     *          {
     *              target: 0x6B175474E89094C44Da98b954EedeAC495271d0F
     *              data: 0x... // calldata for DAI approve function
     *          },
     *          {
     *              target: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
     *              data: 0x... // calldata for USDC approve function
     *          },
     *          {
     *              target: 0xdAC17F958D2ee523a2206206994597C13D831ec7
     *              data: 0x... // calldata for USDT approve function
     *          },
     *          {
     *              target: 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7,
     *              data: 0x... // calldata for the Curve add_liquidity function
     *          }
     *      ]
     *
     * @param viewData The array of asset allocations to calculate the TVL of
     * new assets stored in the Account contract.
     * See APYManagerV2._registerAllocationData.
     */
    function execute(
        bytes32 accountId,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) public override onlyOwner {
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        _registerAllocationData(viewData);
        IAccount(accountAddress).execute(steps);
    }

    /**
     * @notice Move capital from an Account to the APYPoolToken contracts
     * @param accountId The Account contract ID
     * @param allocation Specifies the APYPoolToken contracts to push to and
     * the amounts to push.
     * See APYManagerV2._withdrawFromAccount.
     * @param steps The generic execution sequence that will unwind capital
     * from yield farming strategies and store it in the Account.
     * See APYManagerV2.execute.
     * @param viewData The array of asset allocations to calculate the TVL of
     * new assets stored in the Account contract.
     * See APYManagerV2._registerAllocationData.
     */
    function executeAndWithdraw(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        execute(accountId, steps, viewData);
        _withdrawFromAccount(accountId, allocation);
        _registerAllocationData(viewData);
    }

    /**
     * @notice Move capital from an Account to the APYPoolToken contracts
     * @param accountId The Account contract ID
     * @param allocation Specifies the APYPoolToken contracts to push to and
     * the amounts to push.
     * See APYManagerV2._withdrawFromAccount.
     */
    function withdrawFromAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation
    ) external override onlyOwner {
        _withdrawFromAccount(accountId, allocation);
    }

    /**
     * @notice Move capital from APYPoolToken contracts to an Account
     * @param accountId The Account contract ID
     * @param allocation Specifies the APYPoolToken contracts to pull from and
     * the amounts to pull.
     *
     * @notice AccountAllocation example (pulls ~$1 from each pool):
     *      {
     *          poolIds: ["daiPool", "usdcPool", "usdtPool"],
     *          amounts: ["1000000000000", "1000000", "1000000"]
     *      }
     */
    function _fundAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation
    ) internal {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        uint256[] memory mintAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            uint256 poolAmount = allocation.amounts[i];
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 mintAmount =
                mApt.calculateMintAmount(poolAmount, tokenPrice, decimals);
            mintAmounts[i] = mintAmount;

            underlyer.safeTransferFrom(
                address(pool),
                accountAddress,
                poolAmount
            );
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.mint(address(pool), mintAmounts[i]);
        }
    }

    /**
     * @notice Move capital from an Account to the APYPoolToken contracts
     * @param accountId The Account contract ID
     * @param allocation Specifies the APYPoolToken contracts to push to and
     * the amounts to push.
     *
     * @notice AccountAllocation example (pushes ~$1 to each pool from the Account):
     *      {
     *          poolIds: ["daiPool", "usdcPool", "usdtPool"],
     *          amounts: ["1000000000000", "1000000", "1000000"]
     *      }
     */
    function _withdrawFromAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation
    ) internal {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        uint256[] memory burnAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();
            uint256 amountToSend = allocation.amounts[i];

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 burnAmount =
                mApt.calculateMintAmount(amountToSend, tokenPrice, decimals);
            burnAmounts[i] = burnAmount;

            underlyer.safeTransferFrom(
                accountAddress,
                address(pool),
                amountToSend
            );
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.burn(address(pool), burnAmounts[i]);
        }
    }

    /**
     * @notice Register a new asset allocation
     * @notice When capital is routed to new protocols, asset allocations are
     * registered to return the balances of underlying assets so the TVL can be
     * computed.
     * @param viewData The array of asset allocations to calculate the TVL of
     * new assets stored in the Account contract.
     *
     * @notice AssetAllocation example (gets the DAI balance of the account):
     *      {
     *          sequenceId: "daiBalance",
     *          symbol: "DAI",
     *          decimals: 18,
     *          data: {
     *             target: 0x6B175474E89094C44Da98b954EedeAC495271d0F,
     *             data: 0x... // calldata for balanceOf function with account
     *                         // address encoded as parameter
     *          }
     *      }
     */
    function _registerAllocationData(
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) internal {
        IAssetAllocationRegistry assetAllocationRegistry =
            IAssetAllocationRegistry(
                addressRegistry.getAddress("chainlinkRegistry")
            );
        for (uint256 i = 0; i < viewData.length; i++) {
            IAssetAllocationRegistry.AssetAllocation memory viewAllocation =
                viewData[i];
            assetAllocationRegistry.addAssetAllocation(
                viewAllocation.sequenceId,
                viewAllocation.data,
                viewAllocation.symbol,
                viewAllocation.decimals
            );
        }
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /**
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        mApt = APYMetaPoolToken(_mApt);
    }

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    /// @notice Return the list of pool IDs.
    function getPoolIds() public view returns (bytes32[] memory) {
        return _poolIds;
    }

    function setPoolIds(bytes32[] memory poolIds) public onlyOwner {
        _poolIds = poolIds;
    }

    function deletePoolIds() external onlyOwner {
        delete _poolIds;
    }
}
