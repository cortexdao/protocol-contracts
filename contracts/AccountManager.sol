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
contract AccountManager is Initializable, OwnableUpgradeSafe, IAccountFactory {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    IAddressRegistry public addressRegistry;
    /// @notice Accounts store assets for strategies and interact with other protocols
    mapping(bytes32 => address) public override getAccount;

    /* ------------------------------- */

    event AdminChanged(address);
    event AccountDeployed(
        bytes32 accountId,
        address account,
        address genericExecutor
    );

    /**
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

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
    function initialize(address adminAddress, address _addressRegistry)
        external
        initializer
    {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
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
     * @dev Associates an GenericExecutor with the account. This executor
     * is used when the `execute` function is called for a specific account ID.
     * @param accountId ID identifying an address for execution
     * @param genericExecutor implementation contract for execution engine
     */
    function deployAccount(bytes32 accountId, address genericExecutor)
        external
        override
        onlyOwner
        returns (address)
    {
        Account account = new Account(genericExecutor);
        getAccount[accountId] = address(account);
        emit AccountDeployed(accountId, address(account), genericExecutor);
        return address(account);
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
     * See APYManager._registerAllocationData.
     */
    function execute(
        bytes32 accountId,
        IExecutor.Data[] memory steps,
        ITVLManager.AssetAllocation[] memory viewData
    ) public onlyOwner {
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        _registerAllocationData(viewData);
        IAccount(accountAddress).execute(steps);
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistry(_addressRegistry);
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
        ITVLManager.AssetAllocation[] memory viewData
    ) internal {
        ITVLManager tvlManager =
            ITVLManager(addressRegistry.getAddress("chainlinkRegistry"));
        for (uint256 i = 0; i < viewData.length; i++) {
            ITVLManager.AssetAllocation memory viewAllocation = viewData[i];
            tvlManager.addAssetAllocation(
                viewAllocation.sequenceId,
                viewAllocation.data,
                viewAllocation.symbol,
                viewAllocation.decimals
            );
        }
    }
}
