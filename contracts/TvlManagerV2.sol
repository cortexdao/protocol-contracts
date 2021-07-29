// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {EnumerableSet} from "./utils/EnumerableSet.sol";
import {AccessControl} from "./utils/AccessControl.sol";
import {IAssetAllocation} from "./interfaces/IAssetAllocation.sol";
import {
    IAssetAllocationRegistry
} from "./interfaces/IAssetAllocationRegistry.sol";
import {ITvlManagerV2} from "./interfaces/ITvlManagerV2.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";

/**
 r @title TVL Manager
 * @author APY.Finance
 * @notice Deployed assets can exist across various platforms within the
 * defi ecosystem: pools, accounts, defi protocols, etc. This contract
 * tracks deployed capital by registering the look up functions so that
 * the TVL can be properly computed.
 * @dev It is imperative that this manager has the most up to date asset
 * allocations registered. Any assets in the system that have been deployed,
 * but are not registered can have devastating and catastrophic effects on the TVL.
 */
contract TvlManagerV2 is
    AccessControl,
    ReentrancyGuard,
    ITvlManager,
    IAssetAllocationRegistry
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using Address for address;

    IAddressRegistryV2 public addressRegistry;

    EnumerableSet.AddressSet private _assetAllocations;

    /**
     * @notice Constructor
     * @param addressRegistry_ the address registry to initialize with
     */
    constructor(address addressRegistry_) public {
        _setAddressRegistry(addressRegistry_);
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(CONTRACT_ROLE, addressRegistry.poolManagerAddress());
        _setupRole(LP_ROLE, addressRegistry.lpSafeAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.getAddress("emergencySafe"));
    }

    /**
     * @notice Register a new asset allocation
     * @dev only permissioned accounts can call.
     */
    function registerAssetAllocation(address assetAllocation)
        external
        override
        nonReentrant
    {
        require(
            hasRole(CONTRACT_ROLE, msg.sender) || hasRole(LP_ROLE, msg.sender),
            "INVALID_ACCESS_CONTROL"
        );
        _assetAllocations.add(assetAllocation);
        _lockOracleAdapter();
        emit AssetAllocationRegistered(assetAllocation);
    }

    /**
     * @notice Remove a new asset allocation
     * @dev only permissioned accounts can call.
     */
    function removeAssetAllocation(address assetAllocation)
        external
        override
        nonReentrant
    {
        require(
            hasRole(CONTRACT_ROLE, msg.sender) || hasRole(LP_ROLE, msg.sender),
            "INVALID_ACCESS_CONTROL"
        );
        _assetAllocations.remove(assetAllocation);
        _lockOracleAdapter();
        emit AssetAllocationRemoved(assetAllocation);
    }

    /**
     * @notice Executes the bytes lookup data registered under an id
     * @dev The balance of an id may be aggregated from multiple contracts
     * @param allocationId the id to fetch the balance for
     * @return returns the result of the executed lookup data registered for the provided id
     */
    function balanceOf(bytes32 allocationId)
        external
        view
        override
        returns (uint256)
    {
        (address assetAllocation, address token) =
            _idToAssetAllocation(allocationId);
        return IAssetAllocation(assetAllocation).balanceOf(token);
    }

    /**
     * @notice Returns the token symbol registered under an id
     * @param allocationId the id to fetch the token for
     * @return returns the result of the token symbol registered for the provided id
     */
    function symbolOf(bytes memory allocationId)
        external
        view
        override
        returns (string memory)
    {
        (address assetAllocation, address token) =
            _idToAssetAllocation(allocationId);
        return IAssetAllocation(assetAllocation).symbolOf(token);
    }

    /**
     * @notice Returns the decimals registered under an id
     * @param allocationId the id to fetch the decimals for
     * @return returns the result of the decimal value registered for the provided id
     */
    function decimalsOf(bytes32 allocationId)
        external
        view
        override
        returns (uint256)
    {
        (address assetAllocation, address token) =
            _idToAssetAllocation(allocationId);
        return IAssetAllocation(assetAllocation).decimalsOf(token);
    }

    function getAssetAllocationIds()
        external
        view
        override
        returns (bytes[] memory)
    {
        uint256 idsLength = _getAssetAllocationIdCount();
        bytes[] memory assetAllocationIds = new bytes[](idsLength);

        uint256 k = 0;
        for (uint256 i = 0; i < _assetAllocations.length(); i++) {
            IAssetAllocation assetAllocation = _assetAllocations.at(i);

            address[] memory tokenAddresses = assetAllocation.tokenAddresses();
            uint256 tokensLength = tokenAddresses.length;

            for (uint256 j = 0; j < tokensLength; j++) {
                assetAllocationIds[k] = abi.encodePacked(
                    address(assetAllocation),
                    tokenAddresses[j]
                );
                k++;
            }
        }

        return assetAllocationIds;
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function setAddressRegistry(address addressRegistry_)
        public
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    function _lockOracleAdapter() internal {
        IOracleAdapter oracleAdapter =
            IOracleAdapter(addressRegistry.oracleAdapterAddress());
        oracleAdapter.lock();
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }

    function _getAssetAllocationIdCount() internal view returns (uint256) {
        uint256 idsLength = 0;
        for (uint256 i = 0; i < _assetAllocations.length(); i++) {
            IAssetAllocation assetAllocation = _assetAllocations.at(i);
            idsLength += assetAllocation.tokenAddresses().length;
        }

        return idsLength;
    }

    function _idToAssetAllocation(bytes id)
        internal
        view
        returns (address, address)
    {
        (address assetAllocation, address token) =
            abi.decode(id, (address, address));

        require(
            _assetAllocations.contains(assetAllocation),
            "INVALID_ASSET_ALLOCATION"
        );
        require(
            bytes(IAssetAllocation(assetAllocation).symbolOf(token)).length !=
                0,
            "INVALID_TOKEN"
        );

        return (assetAllocation, token);
    }
}
