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
import "./interfaces/IAccountFunder.sol";
import "./interfaces/IAccountFactory.sol";
import "./interfaces/ITVLManager.sol";
import "./PoolTokenV2.sol";
import "./MetaPoolToken.sol";
import "./Account.sol";

/**
 * @title APY Manager
 * @author APY.Finance
 * @notice This is the manager logic contract for use with the
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
 * register an asset allocation with the TVLManager. Registering
 * asset allocations is important for Chainlink to calculate accurate TVL
 * values.
 *
 * The flexibility of generic execution means previously unused assets may be
 * acquired by the APYAccount contract, including those from providing
 * liquidity to a new protocol. These newly acquired assets and the manner
 * in which they are held in the system must be registered with the
 * TVLManager in order to be used in Chainlink's computation
 * of deployed TVL.
 *
 * Registration should not be done after generic execution as the TVL may
 * then be updated before the registered asset allocations are picked up by
 * Chainlink. Providing the option to register allocations atomically with
 * execution allows us to conveniently leverage generic execution while
 * avoiding late updates to the TVL.
 */
contract PoolManager is Initializable, OwnableUpgradeSafe, IAccountFunder {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    MetaPoolToken public mApt;
    IAddressRegistry public addressRegistry;
    IAccountFactory public accountFactory;
    bytes32[] internal _poolIds;

    /* ------------------------------- */

    event AdminChanged(address);

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
        mApt = MetaPoolToken(_mApt);
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
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        mApt = MetaPoolToken(_mApt);
    }

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    function setAccountFactory(address _accountFactory) public onlyOwner {
        require(Address.isContract(_accountFactory), "INVALID_ADDRESS");
        accountFactory = IAccountFactory(_accountFactory);
    }

    /**
     * @notice Fund Account contract and register an asset allocation
     * @param accountId The Account contract ID
     * @param poolAmounts Specifies the PoolToken contracts to pull from and
     * the amounts to pull.
     *
     * @notice PoolAmount example (pulls ~$1 from each pool to the Account):
     *      [
     *          { poolId: "daiPool", amount: "1000000000000" },
     *          { poolId: "usdcPool", amount: "1000000" },
     *          { poolId: "usdtPool", amount: "1000000" },
     *      ]
     */
    function fundAccount(
        bytes32 accountId,
        IAccountFunder.PoolAmount[] memory poolAmounts
    ) external override onlyOwner {
        address accountAddress = accountFactory.getAccount(accountId);
        require(accountAddress != address(0), "INVALID_ACCOUNT");
        (PoolTokenV2[] memory pools, uint256[] memory amounts) =
            _getPoolsAndAmounts(poolAmounts);
        _registerPoolUnderlyers(accountAddress, pools);
        _fundAccount(accountAddress, pools, amounts);
    }

    function _getPoolsAndAmounts(IAccountFunder.PoolAmount[] memory poolAmounts)
        internal
        view
        returns (PoolTokenV2[] memory, uint256[] memory)
    {
        PoolTokenV2[] memory pools = new PoolTokenV2[](poolAmounts.length);
        uint256[] memory amounts = new uint256[](poolAmounts.length);
        for (uint256 i = 0; i < poolAmounts.length; i++) {
            amounts[i] = poolAmounts[i].amount;
            pools[i] = PoolTokenV2(
                addressRegistry.getAddress(poolAmounts[i].poolId)
            );
        }
        return (pools, amounts);
    }

    /**
     * @notice Register each pool underlyer's allocation for the given account
     *         so that the TVL computation will pick up the account's balance.
     * @param account the address holding the transferred underlyers
     * @param pools pools whose underlyers need to be registered
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
    function _registerPoolUnderlyers(
        address account,
        PoolTokenV2[] memory pools
    ) internal {
        ITVLManager tvlManager =
            ITVLManager(addressRegistry.getAddress("chainlinkRegistry"));
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            IDetailedERC20 underlyer = pool.underlyer();
            string memory symbol = underlyer.symbol();
            bytes memory _data =
                abi.encodeWithSignature("balanceOf(address)", account);
            ITVLManager.Data memory data =
                ITVLManager.Data(address(pool.underlyer()), _data);
            if (!tvlManager.isAssetAllocationRegistered(data)) {
                tvlManager.addAssetAllocation(
                    data,
                    symbol,
                    underlyer.decimals()
                );
            }
        }
    }

    /**
     * @notice Move capital from PoolTokenV2 contracts to an Account
     * @param account The Account contract ID
     * @param pools the pools to pull from
     * @param amounts the amounts to pull from pools
     */
    function _fundAccount(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal {
        uint256[] memory mintAmounts = new uint256[](pools.length);
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            uint256 poolAmount = amounts[i];
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 mintAmount =
                mApt.calculateMintAmount(poolAmount, tokenPrice, decimals);
            mintAmounts[i] = mintAmount;

            underlyer.safeTransferFrom(address(pool), account, poolAmount);
        }
        // MUST do the actual minting after calculating *all* mint amounts,
        // otherwise due to Chainlink not updating during a transaction,
        // the totalSupply will change while TVL doesn't.
        //
        // Using the pre-mint TVL and totalSupply gives the same answer
        // as using post-mint values.
        for (uint256 i = 0; i < pools.length; i++) {
            mApt.mint(address(pools[i]), mintAmounts[i]);
        }
    }

    /**
     * @notice Move capital from an Account to the PoolToken contracts
     * @param accountId The Account contract ID
     * @param poolAmounts Specifies the PoolToken contracts to push to and
     * the amounts to push.
     *
     * @notice PoolAmount example (pushes ~$1 to each pool from the Account):
     *      [
     *          { poolId: "daiPool", amount: "1000000000000" },
     *          { poolId: "usdcPool", amount: "1000000" },
     *          { poolId: "usdtPool", amount: "1000000" },
     *      ]
     */
    function withdrawFromAccount(
        bytes32 accountId,
        IAccountFunder.PoolAmount[] memory poolAmounts
    ) external override onlyOwner {
        address accountAddress = accountFactory.getAccount(accountId);
        require(accountAddress != address(0), "INVALID_ACCOUNT");
        (PoolTokenV2[] memory pools, uint256[] memory amounts) =
            _getPoolsAndAmounts(poolAmounts);
        _checkManagerAllowances(accountAddress, pools, amounts);
        _withdrawFromAccount(accountAddress, pools, amounts);
    }

    /**
     * @dev Revert if pool manager doesn't have enough allowance to transfer
     *      the pool's underlyer from the given account.
     */
    function _checkManagerAllowances(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal view {
        for (uint256 i = 0; i < pools.length; i++) {
            IDetailedERC20 underlyer = pools[i].underlyer();
            uint256 allowance = underlyer.allowance(account, address(this));
            require(amounts[i] <= allowance, "INSUFFICIENT_ALLOWANCE");
        }
    }

    /**
     * @notice Move capital from an Account to the PoolToken contracts
     * @param account The Account contract ID
     * @param pools the pools to pull from
     * @param amounts the amounts to pull from pools
     *
     */
    function _withdrawFromAccount(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal {
        uint256[] memory burnAmounts = new uint256[](pools.length);
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            uint256 amountToSend = amounts[i];
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 burnAmount =
                mApt.calculateMintAmount(amountToSend, tokenPrice, decimals);
            burnAmounts[i] = burnAmount;

            underlyer.safeTransferFrom(account, address(pool), amountToSend);
        }
        // MUST do the actual burning after calculating *all* burn amounts,
        // otherwise due to Chainlink not updating during a transaction,
        // the totalSupply will change while TVL doesn't.
        //
        // Using the pre-burn TVL and totalSupply gives the same answer
        // as using post-burn values.
        for (uint256 i = 0; i < pools.length; i++) {
            mApt.burn(address(pools[i]), burnAmounts[i]);
        }
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
