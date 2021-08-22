// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {
    Initializable
} from "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import {
    ReentrancyGuardUpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import {AccessControlUpgradeSafe} from "./utils/AccessControlUpgradeSafe.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";
import {IZap} from "./interfaces/IZap.sol";
import {ILpAccount} from "./interfaces/ILpAccount.sol";
import {IZapRegistry} from "./interfaces/IZapRegistry.sol";

contract LpAccount is
    Initializable,
    AccessControlUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    ILpAccount,
    IZapRegistry
{
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    address public proxyAdmin;
    IAddressRegistryV2 public addressRegistry;

    EnumerableSet.AddressSet private _zaps;
    mapping(string => address) private _zapNameLookup;

    event AdminChanged(address);
    event AddressRegistryChanged(address);

    /**
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

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
    function initialize(address adminAddress, address addressRegistry_)
        external
        initializer
    {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __ReentrancyGuard_init_unchained();

        // initialize impl-specific storage
        _setAdminAddress(adminAddress);
        _setAddressRegistry(addressRegistry_);
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(LP_ROLE, addressRegistry.lpSafeAddress());
        _setupRole(ADMIN_ROLE, addressRegistry.getAddress("adminSafe"));
        _setupRole(EMERGENCY_ROLE, addressRegistry.getAddress("emergencySafe"));
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

    function emergencySetAdminAddress(address adminAddress)
        external
        onlyEmergencyRole
    {
        _setAdminAddress(adminAddress);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    function deployStrategy(string calldata name, uint256[] calldata amounts)
        external
        override
        onlyLpRole
    {
        address zap = _zapNameLookup[name];
        zap.functionDelegateCall(
            abi.encodeWithSelector(IZap.deployLiquidity.selector, amounts)
        );
    }

    function unwindStrategy(string calldata name, uint256 amount)
        external
        override
        onlyLpRole
    {
        address zap = _zapNameLookup[name];
        zap.functionDelegateCall(
            abi.encodeWithSelector(IZap.unwindLiquidity.selector, amount)
        );
    }

    function registerZap(IZap zap) external override onlyAdminRole {
        require(address(zap).isContract(), "INVALID_ADDRESS");

        string memory name = zap.NAME();
        require(bytes(name).length != 0, "INVALID_ZAP_NAME");

        _zaps.add(address(zap));
        _zapNameLookup[name] = address(zap);
    }

    function removeZap(string calldata name) external override onlyAdminRole {
        address zap = _zapNames[name];
        require(zap != address(0), "INVALID_ZAP_NAME");
        require(_zaps.remove(zap), "ZAP_DOES_NOT_EXIST");

        delete _zapNameLookup[zap];
    }

    function names() external view override returns (string[] calldata) {
        uint256 length = _zaps.length;
        string[] memory names_ = new string[](length);

        for (uint256 i = 0; i < length; i++) {
            IZap zap = IZap(_zaps.get(i));
            names_[i] = zap.NAME();
        }

        return names_;
    }

    function _setAdminAddress(address adminAddress) internal {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function _setAddressRegistry(address addressRegistry_) internal {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }
}
