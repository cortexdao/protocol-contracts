// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {EnumerableSet} from "./utils/EnumerableSet.sol";
import {AccessControl} from "./utils/AccessControl.sol";
import {
    IAssetAllocationRegistry
} from "./interfaces/IAssetAllocationRegistry.sol";
import {ITvlManager} from "./interfaces/ITvlManager.sol";
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
contract TvlManager is
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
        lockOracleAdapter();
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
        lockOracleAdapter();
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
        require(
            _isAssetAllocationRegistered(allocationId),
            "INVALID_ALLOCATION_ID"
        );
        Data memory data = allocationData[allocationId];
        bytes memory returnData = executeView(data);

        uint256 _balance;
        assembly {
            _balance := mload(add(returnData, 0x20))
        }

        return _balance;
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
        return allocationSymbols[allocationId];
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
        return allocationDecimals[allocationId];
    }

    function getAssetAllocationIds()
        external
        view
        override
        returns (bytes32[] memory)
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

    function _getAssetAllocationIdCount() internal view returns (uint256) {
        uint256 idsLength = 0;
        for (uint256 i = 0; i < _assetAllocations.length(); i++) {
            IAssetAllocation assetAllocation = _assetAllocations.at(i);
            idsLength += assetAllocation.tokenAddresses().length;
        }

        return idsLength;
    }

    /**
     * @notice Returns a list of all identifiers where asset allocations have been registered
     * @dev the list contains no duplicate identifiers
     * @return list of all the registered identifiers
     */
    function getAssetAllocationIds()
        external
        view
        override
        returns (bytes32[] memory)
    {
        uint256 length = allocationIds.length();
        bytes32[] memory allocationIds_ = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            allocationIds_[i] = allocationIds.at(i);
        }
        return allocationIds_;
    }

    /**
     * @notice Generates a data hash used for uniquely identifying asset allocations
     * @param data the data hash containing the target address and the bytes lookup data
     * @return returns the resulting bytes32 hash of the abi encode packed target address and bytes look up data
     */
    function createId(Data memory data) public pure override returns (bytes32) {
        return keccak256(abi.encodePacked(data.target, data.data));
    }

    /**
     * @notice determines if a target address and bytes lookup data has already been registered
     * @param data the struct containing the target address and the bytes lookup data
     * @return returns true if the asset allocation is currently registered, otherwise false
     */
    function isAssetAllocationRegistered(Data memory data)
        public
        view
        override
        returns (bool)
    {
        return _isAssetAllocationRegistered(createId(data));
    }

    /**
     * @notice helper function for isAssetallocationRegistered function
     * @param id the asset allocation ID
     * @return returns true if the asset allocation is currently registered, otherwise false
     */
    function _isAssetAllocationRegistered(bytes32 id)
        public
        view
        returns (bool)
    {
        return allocationIds.contains(id);
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

    /**
     * @notice Executes data's bytes look up data against data's target address
     * @dev execution is a static call
     * @param data the data hash containing the target address and the bytes lookup data to execute
     * @return returnData returns return data from the executed contract
     */
    function executeView(Data memory data)
        public
        view
        returns (bytes memory returnData)
    {
        returnData = data.target.functionStaticCall(data.data);
    }

    function lockOracleAdapter() internal {
        IOracleAdapter oracleAdapter =
            IOracleAdapter(addressRegistry.oracleAdapterAddress());
        oracleAdapter.lock();
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }
}
