// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";

/**
 * @title APY.Finance Manager
 * @author APY.Finance
 * @notice This is the initial version of the manager, deployed
 * primarily for the proxy and to register its address with
 * the address registry.
 *
 * It has limited functionality and is only used for testing
 * the implementation for the interface used by Chainlink.
 *
 * For the alpha launch, we will be upgrading to a V2 version
 * which has real functionality.
 *
 * Note that the Chainlink interface functions (indicated below
 * individually) are deprecated.  Consult APYManagerV2 for the
 * new interface and its implemention.
 */
contract APYManager is Initializable, OwnableUpgradeSafe {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    /** @notice the same address as the proxy admin; used
     *  to protect init functions for upgrades */
    address public proxyAdmin;
    IAddressRegistry public addressRegistry;
    address public mApt; // placeholder for future-proofing storage

    bytes32[] internal _poolIds;
    address[] internal _tokenAddresses;

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
     * repeatedly.  It should be called during the deployment so that
     * it cannot be called by someone else later.
     */
    function initialize(address adminAddress) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
    }

    /**
     * @dev Dummy function to show how one would implement an init function
     * for future upgrades.  Note the `initializer` modifier can only be used
     * once in the entire contract, so we can't use it here.  Instead,
     * we set the proxy admin address as a variable and protect this
     * function with `onlyAdmin`, which only allows the proxy admin
     * to call this function during upgrades.
     */
    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

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

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(_addressRegistry != address(0), "Invalid address");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    function setPoolIds(bytes32[] memory poolIds) public onlyOwner {
        _poolIds = poolIds;
    }

    function getPoolIds() public view returns (bytes32[] memory) {
        return _poolIds;
    }

    /** @notice Returns the list of asset addresses.
     *  @dev Address list will be populated automatically from the set
     *       of input and output assets for each Account.
     *
     *       Note the use of token addresses is deprecated.  The V2
     *       manager will use asset allocation IDs.
     */
    function getTokenAddresses() external view returns (address[] memory) {
        return _tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration
    function setTokenAddresses(address[] calldata tokenAddresses)
        external
        onlyOwner
    {
        _tokenAddresses = tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deleteTokenAddresses() external onlyOwner {
        delete _tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deletePoolIds() external onlyOwner {
        delete _poolIds;
    }

    /** @notice Returns the total balance in the system for given token.
     *  @dev The balance is possibly aggregated from multiple contracts
     *       holding the token.
     *
     *       This is a temporary implementation until there are deployed funds.
     *       In actuality, we will not be computing the TVL from the pools,
     *       as their funds will not be tokenized into mAPT.
     *
     *       Note the use of token addresses is deprecated.  The V2
     *       manager will use asset allocation IDs.
     */
    function balanceOf(address token) external view returns (uint256) {
        IERC20 erc20 = IERC20(token);
        uint256 balance = 0;
        for (uint256 i = 0; i < _poolIds.length; i++) {
            address pool = addressRegistry.getAddress(_poolIds[i]);
            uint256 poolBalance = erc20.balanceOf(pool);
            balance = balance.add(poolBalance);
        }
        return balance;
    }

    /// @notice Returns the symbol of the given token.
    /// @dev deprecated; new Chainlink interface uses asset allocation IDs
    /// insead of token addresses.
    function symbolOf(address token) external view returns (string memory) {
        return ERC20UpgradeSafe(token).symbol();
    }
}
