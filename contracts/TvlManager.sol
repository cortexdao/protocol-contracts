// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./utils/EnumerableSet.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/ITvlManager.sol";
import "./interfaces/IOracleAdapter.sol";
import "./interfaces/IAddressRegistryV2.sol";

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
    IAssetAllocation
{
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using Address for address;

    bytes32 public constant CONTRACT_ROLE = keccak256("CONTRACT_ROLE");
    bytes32 public constant LP_ROLE = keccak256("LP_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    IAddressRegistryV2 public addressRegistry;

    // all registered allocation ids
    EnumerableSet.Bytes32Set private allocationIds;
    // ids mapped to data
    mapping(bytes32 => Data) private allocationData;
    // ids mapped to symbol
    mapping(bytes32 => string) private allocationSymbols;
    // ids mapped to decimals
    mapping(bytes32 => uint256) private allocationDecimals;

    /**
     * @notice Constructor
     * @param addressRegistry_ the address registry to initialize with
     */
    constructor(address addressRegistry_) public {
        _setupRole(CONTRACT_ROLE, addressRegistry_.poolManagerAddress());
        _setupRole(LP_ROLE, addressRegistry_.lpSafeAddress());
        _setupRole(
            EMERGENCY_ROLE,
            addressRegistry_.getAddress("emergencySafe")
        );

        setAddressRegistry(addressRegistry_);
    }

    /**
     * @notice Registers a new asset allocation
     * @dev only permissed accounts can call.
     * New ids are uniquely determined by the provided data struct; no duplicates are allowed
     * @param data the data struct containing the target address and the bytes lookup data that will be registered
     * @param symbol the token symbol to register for the asset allocation
     * @param decimals the decimals to register for the new asset allocation
     */
    function addAssetAllocation(
        Data memory data,
        string calldata symbol,
        uint256 decimals
    ) external override nonReentrant {
        require(
            hasRole(CONTRACT_ROLE) || hasRole(LP_ROLE),
            "INVALID_ACCESS_CONTROL"
        );

        require(!isAssetAllocationRegistered(data), "DUPLICATE_DATA_DETECTED");
        bytes32 dataHash = generateDataHash(data);
        allocationIds.add(dataHash);
        allocationData[dataHash] = data;
        allocationSymbols[dataHash] = symbol;
        allocationDecimals[dataHash] = decimals;
        lockOracleAdapter();
        emit AssetAllocationAdded(data, symbol, decimals);
    }

    /**
     * @notice Removes an existing asset allocation
     * @dev only permissed accounts can call.
     * @param data the data struct containing the target address and bytes lookup data that will be removed
     */
    function removeAssetAllocation(Data memory data)
        external
        override
        nonReentrant
    {
        require(
            hasRole(CONTRACT_ROLE) || hasRole(LP_ROLE),
            "INVALID_ACCESS_CONTROL"
        );

        require(isAssetAllocationRegistered(data), "ALLOCATION_DOES_NOT_EXIST");
        bytes32 dataHash = generateDataHash(data);
        allocationIds.remove(dataHash);
        delete allocationData[dataHash];
        string memory symbol = allocationSymbols[dataHash];
        delete allocationSymbols[dataHash];
        delete allocationDecimals[dataHash];
        lockOracleAdapter();
        emit AssetAllocationRemoved(data, symbol);
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
    function generateDataHash(Data memory data)
        public
        pure
        override
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(data.target, data.data));
    }

    /**
     * @notice determines if a target address and bytes lookup data has already been registered
     * @param data the data hash containing the target address and the bytes lookup data
     * @return returns true if the asset allocation is currently registered, otherwise false
     */
    function isAssetAllocationRegistered(Data memory data)
        public
        view
        override
        returns (bool)
    {
        return _isAssetAllocationRegistered(generateDataHash(data));
    }

    /**
     * @notice helper function for isAssetallocationRegistered function
     * @param data the bytes32 hash
     * @return returns true if the asset allocation is currently registered, otherwise false
     */
    function _isAssetAllocationRegistered(bytes32 data)
        public
        view
        returns (bool)
    {
        return allocationIds.contains(data);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function setAddressRegistry(address addressRegistry_) public {
        require(hasRole(EMERGENCY_ROLE), "INVALID_ACCESS_CONTROL");
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
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
}
