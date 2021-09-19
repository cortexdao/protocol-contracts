// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    IAssetAllocation,
    ReentrancyGuard,
    AccessControl
} from "contracts/common/Imports.sol";
import {NamedAddressSet} from "contracts/libraries/Imports.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {ILockingOracle} from "contracts/oracle/Imports.sol";

import {IChainlinkRegistry} from "./IChainlinkRegistry.sol";
import {IAssetAllocationRegistry} from "./IAssetAllocationRegistry.sol";
import {Erc20AllocationConstants} from "./Erc20Allocation.sol";

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
    IChainlinkRegistry,
    IAssetAllocationRegistry,
    Erc20AllocationConstants
{
    using NamedAddressSet for NamedAddressSet.AssetAllocationSet;

    IAddressRegistryV2 public addressRegistry;

    NamedAddressSet.AssetAllocationSet private _assetAllocations;

    event AddressRegistryChanged(address);
    event Erc20AllocationChanged(address);

    /**
     * @notice Constructor
     */
    constructor(address addressRegistry_) public {
        _setAddressRegistry(addressRegistry_);
        _setupRole(DEFAULT_ADMIN_ROLE, addressRegistry.emergencySafeAddress());
        _setupRole(LP_ROLE, addressRegistry.lpSafeAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.emergencySafeAddress());
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
     * @notice Register a new asset allocation
     * @dev Only permissioned accounts can call.
     */
    function registerAssetAllocation(IAssetAllocation assetAllocation)
        external
        override
        nonReentrant
        onlyLpOrContractRole
    {
        _assetAllocations.add(assetAllocation);

        _lockOracleAdapter();

        emit AssetAllocationRegistered(assetAllocation);
    }

    /**
     * @notice Remove a new asset allocation
     * @dev Only permissioned accounts can call.
     */
    function removeAssetAllocation(string memory name)
        external
        override
        nonReentrant
        onlyLpOrContractRole
    {
        require(
            keccak256(abi.encodePacked(name)) !=
                keccak256(abi.encodePacked(Erc20AllocationConstants.NAME)),
            "CANNOT_REMOVE_ALLOCATION"
        );

        _assetAllocations.remove(name);

        _lockOracleAdapter();

        emit AssetAllocationRemoved(name);
    }

    function getAssetAllocation(string calldata name)
        external
        view
        override
        returns (IAssetAllocation)
    {
        return _assetAllocations.get(name);
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

    function isAssetAllocationRegistered(string[] calldata allocationNames)
        external
        view
        override
        returns (bool)
    {
        uint256 length = allocationNames.length;
        for (uint256 i = 0; i < length; i++) {
            IAssetAllocation allocation =
                _assetAllocations.get(allocationNames[i]);
            if (address(allocation) == address(0)) {
                return false;
            }
        }

        return true;
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
        (IAssetAllocation assetAllocation, uint8 tokenIndex) =
            _getAssetAllocation(allocationId);
        return
            assetAllocation.balanceOf(
                addressRegistry.lpAccountAddress(),
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
        (IAssetAllocation assetAllocation, uint8 tokenIndex) =
            _getAssetAllocation(allocationId);
        return assetAllocation.symbolOf(tokenIndex);
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
        (IAssetAllocation assetAllocation, uint8 tokenIndex) =
            _getAssetAllocation(allocationId);
        return assetAllocation.decimalsOf(tokenIndex);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }

    function _lockOracleAdapter() internal {
        ILockingOracle oracleAdapter =
            ILockingOracle(addressRegistry.oracleAdapterAddress());
        oracleAdapter.lock();
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

    function _getAssetAllocation(bytes32 id)
        internal
        view
        returns (IAssetAllocation, uint8)
    {
        (address assetAllocationAddress, uint8 tokenIndex) =
            _decodeAssetAllocationId(id);

        IAssetAllocation assetAllocation =
            IAssetAllocation(assetAllocationAddress);

        require(
            _assetAllocations.contains(assetAllocation),
            "INVALID_ASSET_ALLOCATION"
        );
        require(
            assetAllocation.numberOfTokens() > tokenIndex,
            "INVALID_TOKEN_INDEX"
        );

        return (assetAllocation, tokenIndex);
    }

    function _getAssetAllocationIdCount(IAssetAllocation[] memory allocations)
        internal
        view
        returns (uint256)
    {
        uint256 idsLength = 0;
        for (uint256 i = 0; i < allocations.length; i++) {
            idsLength += allocations[i].numberOfTokens();
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
            allocations[i] = _assetAllocations.at(i);
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
