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
 * @title Account Manager
 * @author APY.Finance
 * @notice This is the manager logic contract for use with the account manager proxy contract.
 *
 * The Account Manager orchestrates the movement of capital within the APY system between the Accounts
 * and various DeFi protocols: curve, uniswap, sushiswap, etc
 *
 * When moving capital from an account to enter various positions, the Account Manager simultaneously
 * registers view execution data with the TVL Manager. This is to ensure the TVL is properly updated
 * and all funds moved are accounted for.
 *
 * It is imperative that when calling execute() against a deployed Account, the AccountManager
 * is provided the most up to date asset allocations. Any assets in the system that have been
 * deployed, but are not registered with the TVL Manager can have devastating and catastrophic
 * effects on the TVL.
 */
contract AccountManager is Initializable, OwnableUpgradeSafe, IAccountFactory {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    struct Deployment {
        uint256 timestamp;
        uint256 tvl;
        mapping(address => uint256) prices;
    }

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    IAddressRegistry public addressRegistry;
    /// @notice Accounts store assets for strategies and interact with other protocols
    mapping(bytes32 => address) public override getAccount;
    /// @notice Track TVLs and prices at deployment
    mapping(uint256 => Deployment) public deployments;
    /// @notice Track most recent deployment
    uint256 public lastDeploymentId;

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
     * @param adminAddress the admin proxy to initialize with
     * @param _addressRegistry the address registry to initialize with
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
     * @notice Creates a new account that wil be used to enter other positions.
     * @dev only callable by owner
     * @param accountId id of the Account moving funds
     * @param genericExecutor implementation contract for execution engine the account will use
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

    /// @notice Routes capital in an Account to enter or exit various positions
    /// @dev only callable by owner
    /// @param accountId id of the Account moving funds
    /// @param steps list of Data execution steps containing both the target contract and bytecode to execute
    /// @param viewData list of AssetAllocation view data that need to be registered with the TVL manager when entering positions
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

    /// @notice Sets the proxy admin address of the pool manager proxy
    /// @dev only callable by owner
    /// @param adminAddress the new proxy admin address of the pool manager
    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /// @notice Sets the address registry
    /// @dev only callable by owner
    /// @param _addressRegistry the new address registry to update to
    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    /// @notice Helper function to register an account's lookup view method in the TVL manager when entering positions.
    /// Ensures the TVL manager remains up to date when funds are moved.
    /// @param viewData list of AssetAllocation view data to be registered with the TVL manager
    function _registerAllocationData(
        ITVLManager.AssetAllocation[] memory viewData
    ) internal {
        ITVLManager tvlManager =
            ITVLManager(addressRegistry.getAddress("tvlManager"));
        for (uint256 i = 0; i < viewData.length; i++) {
            ITVLManager.AssetAllocation memory viewAllocation = viewData[i];
            tvlManager.addAssetAllocation(
                viewAllocation.data,
                viewAllocation.symbol,
                viewAllocation.decimals
            );
        }
    }
}
