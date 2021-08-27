// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Address, NamedAddressSet} from "contracts/libraries/Imports.sol";

import {IAddressRegistryV2} from "contracts/registry/Imports.sol";

import {
    IErc20Allocation,
    IAssetAllocationRegistry,
    Erc20AllocationConstants
} from "contracts/tvl/Imports.sol";

import {
    Initializable,
    ReentrancyGuardUpgradeSafe,
    AccessControlUpgradeSafe
} from "contracts/proxy/Imports.sol";

import {IZap, ILpAccount, IZapRegistry} from "./Imports.sol";

contract LpAccount is
    Initializable,
    AccessControlUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    ILpAccount,
    IZapRegistry,
    Erc20AllocationConstants
{
    using Address for address;
    using NamedAddressSet for NamedAddressSet.ZapSet;

    address public proxyAdmin;
    IAddressRegistryV2 public addressRegistry;

    NamedAddressSet.ZapSet private _zaps;

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
        nonReentrant
        onlyLpRole
    {
        IZap zap = _zaps.get(name);
        require(address(zap) != address(0), "INVALID_NAME");

        (bool isAssetAllocationRegistered, bool isErc20TokenRegistered) =
            _checkRegistrations(zap.assetAllocations(), zap.erc20Allocations());
        // TODO: If the asset allocation is deployed, but not registered, register it
        // TODO: If an ERC20 allocation is missing, add it
        require(isAssetAllocationRegistered, "MISSING_ASSET_ALLOCATIONS");
        require(isErc20TokenRegistered, "MISSING_ERC20_ALLOCATIONS");

        address(zap).functionDelegateCall(
            abi.encodeWithSelector(IZap.deployLiquidity.selector, amounts)
        );
    }

    function _checkRegistrations(
        IAssetAllocation[] memory allocations,
        IERC20[] memory tokens
    )
        internal
        returns (bool isAssetAllocationRegistered, bool isErc20TokenRegistered)
    {
        IAssetAllocationRegistry tvlManager =
            IAssetAllocationRegistry(addressRegistry.getAddress("tvlManager"));
        isAssetAllocationRegistered = tvlManager.isAssetAllocationRegistered(
            allocations
        );

        IErc20Allocation erc20Allocation =
            IErc20Allocation(
                address(
                    tvlManager.getAssetAllocation(Erc20AllocationConstants.NAME)
                )
            );
        isErc20TokenRegistered = erc20Allocation.isErc20TokenRegistered(tokens);
    }

    function unwindStrategy(string calldata name, uint256 amount)
        external
        override
        nonReentrant
        onlyLpRole
    {
        address zap = address(_zaps.get(name));
        require(zap != address(0), "INVALID_NAME");

        zap.functionDelegateCall(
            abi.encodeWithSelector(IZap.unwindLiquidity.selector, amount)
        );
    }

    function registerZap(IZap zap) external override onlyAdminRole {
        _zaps.add(zap);

        emit ZapRegistered(zap);
    }

    function removeZap(string calldata name) external override onlyAdminRole {
        _zaps.remove(name);

        emit ZapRemoved(name);
    }

    function names() external view override returns (string[] memory) {
        return _zaps.names();
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
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }
}
