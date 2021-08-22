// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "./utils/EnumerableSet.sol";
import {AccessControl} from "./utils/AccessControl.sol";
import {IAssetAllocation} from "./interfaces/IAssetAllocation.sol";
import {
    IAssetAllocationRegistry
} from "./interfaces/IAssetAllocationRegistry.sol";
import {
    IErc20AllocationRegistry
} from "./interfaces/IErc20AllocationRegistry.sol";
import {ITvlManager} from "./interfaces/ITvlManager.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";

/**
 r @title TVL Manager
 * @author APY.Finance
 * @notice Assets can be deployed in a variety of ways within the DeFi
 *         ecosystem: accounts, pools, vaults, gauges, etc. This contract
 *         tracks deployed capital by registering functions that allow
 *         position balances to be priced and aggregated by Chainlink
 *         into the deployed TVL.
 * @dev It is imperative that the registered asset allocations are up-to-date.
 *      Any assets in the system that have been deployed but are not
 *      registered could lead to significant misreporting of the TVL.
 */
contract TvlManager is
    AccessControl,
    ReentrancyGuard,
    ITvlManager,
    IAssetAllocationRegistry
{
    using EnumerableSet for EnumerableSet.AddressSet;

    IAddressRegistryV2 public addressRegistry;
    IErc20AllocationRegistry public override erc20Allocation;

    EnumerableSet.AddressSet private _assetAllocations;

    event AddressRegistryChanged(address);
    event Erc20AllocationChanged(address);

    /**
     * @dev The ERC20 allocation is required in order to ensure that
     *      funds in the LP Safe will properly reflect in the TVL.
     * @param addressRegistry_ the Address Registry
     * @param erc20Allocation_ the ERC20 allocation
     */
    constructor(address addressRegistry_, address erc20Allocation_) public {
        _setAddressRegistry(addressRegistry_);
        _setErc20Allocation(erc20Allocation_);
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(LP_ROLE, addressRegistry.lpSafeAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.getAddress("emergencySafe"));
    }

    /**
     * @notice Sets the new Address Registry
     * @dev Only callable by the Emergency Safe
     * @param addressRegistry_ new address of the Address Registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    /**
     * @notice Sets the new ERC20 allocation contract
     * @dev Only callable by Emergency Safe
     * @param erc20Allocation_ new address of the ERC20 allocation
     */
    function emergencySetErc20Allocation(address erc20Allocation_)
        external
        onlyEmergencyRole
    {
        _setErc20Allocation(erc20Allocation_);
    }

    /**
     * @notice Register a new asset allocation
     * @dev Only permissioned accounts can call.
     */
    function registerAssetAllocation(address assetAllocation)
        external
        override
        nonReentrant
        onlyLpOrContractRole
    {
        require(assetAllocation.isContract(), "INVALID_ADDRESS");
        _assetAllocations.add(assetAllocation);
        _lockOracleAdapter();
        emit AssetAllocationRegistered(assetAllocation);
    }

    /**
     * @notice Remove a new asset allocation
     * @dev Only permissioned accounts can call.
     */
    function removeAssetAllocation(address assetAllocation)
        external
        override
        nonReentrant
        onlyLpOrContractRole
    {
        require(
            assetAllocation != address(erc20Allocation),
            "CANNOT_REMOVE_ALLOCATION"
        );

        _assetAllocations.remove(assetAllocation);

        _lockOracleAdapter();

        emit AssetAllocationRemoved(assetAllocation);
    }

    /**
     * @notice Returns a list of all identifiers coming from registered
     *         asset allocations.
     * @dev The list contains no duplicate identifiers. Note that IDs
     *      are not static, e.g. a particular position's ID may change
     *      from updates to asset allocation contracts.
     * @return list of all the registered identifiers
     */
    function getAssetAllocationIds()
        external
        view
        override
        returns (bytes32[] memory)
    {
        IAssetAllocation[] memory allocations = _getAssetAllocations();
        return _getAssetAllocationsIds(allocations);
    }

    function _getAssetAllocationsIds(IAssetAllocation[] memory allocations)
        internal
        view
        returns (bytes32[] memory)
    {
        uint256 idsLength = _getAssetAllocationIdCount(allocations);
        bytes32[] memory assetAllocationIds = new bytes32[](idsLength);

        uint256 k = 0;
        for (uint256 i = 0; i < allocations.length; i++) {
            uint256 tokensLength = allocations[i].numberOfTokens();

            require(tokensLength < type(uint8).max, "TOO_MANY_TOKENS");

            for (uint256 j = 0; j < tokensLength; j++) {
                assetAllocationIds[k] = _encodeAssetAllocationId(
                    address(allocations[i]),
                    uint8(j)
                );
                k++;
            }
        }

        return assetAllocationIds;
    }

    /// @dev Validates and encodes the given args into an allocation ID.
    function encodeAssetAllocationId(address assetAllocation, uint8 tokenIndex)
        external
        view
        override
        returns (bytes32)
    {
        require(
            _assetAllocations.contains(assetAllocation),
            "INVALID_ASSET_ALLOCATION"
        );
        require(
            IAssetAllocation(assetAllocation).numberOfTokens() > tokenIndex,
            "INVALID_TOKEN_INDEX"
        );

        return _encodeAssetAllocationId(assetAllocation, tokenIndex);
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
        (address assetAllocation, uint8 tokenIndex) =
            decodeAssetAllocationId(allocationId);
        return
            IAssetAllocation(assetAllocation).balanceOf(
                addressRegistry.lpSafeAddress(),
                tokenIndex
            );
    }

    /**
     * @notice Returns the token symbol registered under an id
     * @param allocationId the id to fetch the token for
     * @return returns the result of the token symbol registered for the provided id
     */
    function symbolOf(bytes32 allocationId)
        external
        view
        override
        returns (string memory)
    {
        (address assetAllocation, uint8 tokenIndex) =
            decodeAssetAllocationId(allocationId);
        return IAssetAllocation(assetAllocation).symbolOf(tokenIndex);
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
        (address assetAllocation, uint8 tokenIndex) =
            decodeAssetAllocationId(allocationId);
        return IAssetAllocation(assetAllocation).decimalsOf(tokenIndex);
    }

    /// @dev decodes the given allocation ID and validates
    function decodeAssetAllocationId(bytes32 id)
        public
        view
        override
        returns (address, uint8)
    {
        (address assetAllocation, uint8 tokenIndex) =
            _decodeAssetAllocationId(id);

        require(
            _assetAllocations.contains(assetAllocation),
            "INVALID_ASSET_ALLOCATION"
        );
        require(
            IAssetAllocation(assetAllocation).numberOfTokens() > tokenIndex,
            "INVALID_TOKEN_INDEX"
        );

        return (assetAllocation, tokenIndex);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }

    function _setErc20Allocation(address erc20Allocation_) internal {
        require(erc20Allocation_.isContract(), "INVALID_ADDRESS");
        _assetAllocations.remove(address(erc20Allocation));
        _assetAllocations.add(erc20Allocation_);
        erc20Allocation = IErc20AllocationRegistry(erc20Allocation_);
        emit Erc20AllocationChanged(erc20Allocation_);
    }

    function _lockOracleAdapter() internal {
        IOracleAdapter oracleAdapter =
            IOracleAdapter(addressRegistry.oracleAdapterAddress());
        oracleAdapter.lock();
    }

    /// @dev Returns the total number of asset allocation IDs.
    function _getAssetAllocationIdCount(IAssetAllocation[] memory allocations)
        internal
        view
        returns (uint256)
    {
        uint256 idsLength = 0;
        for (uint256 i = 0; i < allocations.length; i++) {
            IAssetAllocation allocation = IAssetAllocation(allocations[i]);
            idsLength += allocation.numberOfTokens();
        }

        return idsLength;
    }

    /// @dev Returns the list of asset allocation contracts.
    function _getAssetAllocations()
        internal
        view
        returns (IAssetAllocation[] memory)
    {
        uint256 numAllocations = _assetAllocations.length();
        IAssetAllocation[] memory allocations =
            new IAssetAllocation[](numAllocations);
        for (uint256 i = 0; i < numAllocations; i++) {
            allocations[i] = IAssetAllocation(_assetAllocations.at(i));
        }
        return allocations;
    }

    function _encodeAssetAllocationId(address assetAllocation, uint8 tokenIndex)
        internal
        pure
        returns (bytes32)
    {
        bytes memory idPacked = abi.encodePacked(assetAllocation, tokenIndex);

        bytes32 id;

        assembly {
            id := mload(add(idPacked, 32))
        }

        return id;
    }

    function _decodeAssetAllocationId(bytes32 id)
        internal
        pure
        returns (address, uint8)
    {
        uint256 id_ = uint256(id);

        address assetAllocation = address(bytes20(uint160(id_ >> 96)));
        uint8 tokenIndex = uint8(id_ >> 88);

        return (assetAllocation, tokenIndex);
    }
}
