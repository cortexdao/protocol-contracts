// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/EnumerableSet.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/ITVLManager.sol";

/// @title TVL Manager
/// @author APY.Finance
/// @notice Deployed assets can exist across various platforms within the
/// defi ecosystem: pools, accounts, defi protocols, etc. This contract
/// tracks deployed capital by registering the look up functions so that
/// the TVL can be properly computed.
/// @dev It is imperative that this manager has the most up to date asset
/// allocations registered. Any assets in the system that have been deployed,
/// but are not registered can have devastating and catastrophic effects on the TVL
contract TVLManager is Ownable, ITVLManager, IAssetAllocation {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public poolManager;
    address public accountManager;

    // all registered allocation ids
    EnumerableSet.Bytes32Set private _allocationIds;
    // ids mapped to data
    mapping(bytes32 => Data) private _allocationData;
    // ids mapped to symbol
    mapping(bytes32 => string) private _allocationSymbols;
    // ids mapped to decimals
    mapping(bytes32 => uint256) private _allocationDecimals;

    event PoolManagerChanged(address);
    event AccountManagerChanged(address);

    /// @notice Constructor TVLManager
    /// @param poolManagerAddress the pool manager allowed to register new asset allocations
    /// @param accountManagerAddress the account manager allowed to register new asset allocations
    constructor(address poolManagerAddress, address accountManagerAddress)
        public
    {
        require(poolManagerAddress != address(0), "INVALID_MANAGER");
        require(accountManagerAddress != address(0), "INVALID_MANAGER");
        setPoolManagerAddress(poolManagerAddress);
        setAccountManagerAddress(accountManagerAddress);
    }

    /// @notice Sets the pool manager address
    /// @dev only owner can call, 0x0 addresss is disallowed
    /// @param _manager the new pool manager
    function setPoolManagerAddress(address _manager) public onlyOwner {
        require(_manager != address(0), "INVALID_MANAGER");
        poolManager = _manager;
        emit PoolManagerChanged(_manager);
    }

    /// @notice Sets the account manager address
    /// @dev only owner can call, 0x0 address is disallowed
    /// @param _manager the new account manager
    function setAccountManagerAddress(address _manager) public onlyOwner {
        require(_manager != address(0), "INVALID_MANAGER");
        accountManager = _manager;
        emit AccountManagerChanged(_manager);
    }

    /// @dev Reverts if non-permissed account calls.
    /// Permissioned accounts are: owner, pool manager, and account manager
    modifier onlyPermissioned() {
        require(
            msg.sender == owner() ||
                msg.sender == poolManager ||
                msg.sender == accountManager,
            "PERMISSIONED_ONLY"
        );
        _;
    }

    /// @notice Registers a new asset allocation
    /// @dev only permissed accounts can call.
    /// New ids are uniquely determined by the provided data struct; no duplicates are allowed
    /// @param data the data struct containing the target address and the bytes lookup data that will be registered
    /// @param symbol the symbol to register for the asset allocation
    /// @param decimals the decimals to register for the new asset allocation
    function addAssetAllocation(
        Data memory data,
        string calldata symbol,
        uint256 decimals
    ) external override onlyPermissioned {
        require(!isAssetAllocationRegistered(data), "DUPLICATE_DATA_DETECTED");
        bytes32 dataHash = generateDataHash(data);
        _allocationIds.add(dataHash);
        _allocationData[dataHash] = data;
        _allocationSymbols[dataHash] = symbol;
        _allocationDecimals[dataHash] = decimals;
    }

    /// @notice Removes an existing asset allocation
    /// @dev only permissed accounts can call.
    /// @param data the data struct containing the target address and bytes lookup data that will be removed
    function removeAssetAllocation(Data memory data)
        external
        override
        onlyPermissioned
    {
        require(isAssetAllocationRegistered(data), "ALLOCATION_DOES_NOT_EXIST");
        bytes32 dataHash = generateDataHash(data);
        _allocationIds.remove(dataHash);
        delete _allocationData[dataHash];
        delete _allocationSymbols[dataHash];
        delete _allocationDecimals[dataHash];
    }

    /// @notice Generates a data hash used for uniquely identifying asset allocations
    /// @param data the data hash containing the target address and the bytes lookup data
    /// @return returns the resulting bytes32 hash of the abi encode packed target address and bytes look up data
    function generateDataHash(Data memory data)
        public
        pure
        override
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(data.target, data.data));
    }

    /// @notice determines if a target address and bytes lookup data has already been registered
    /// @param data the data hash containing the target address and the bytes lookup data
    /// @return returns true if the asset allocation is currently registered, otherwise false
    function isAssetAllocationRegistered(Data memory data)
        public
        view
        override
        returns (bool)
    {
        return _isAssetAllocationRegistered(generateDataHash(data));
    }

    /// @notice helper function for isAssetallocationRegistered function
    /// @param data the bytes32 hash
    /// @return returns true if the asset allocation is currently registered, otherwise false
    function _isAssetAllocationRegistered(bytes32 data)
        public
        view
        returns (bool)
    {
        return _allocationIds.contains(data);
    }

    /// @notice Returns a list of all identifiers where asset allocations have been registered
    /// @dev the list contains no duplicate identifiers
    /// @return list of all the registered identifiers
    function getAssetAllocationIds()
        external
        view
        override
        returns (bytes32[] memory)
    {
        uint256 length = _allocationIds.length();
        bytes32[] memory allocationIds = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            allocationIds[i] = _allocationIds.at(i);
        }
        return allocationIds;
    }

    /// @notice Executes the bytes lookup data registered under an id
    /// @dev The balance of an id may be aggregated from multiple contracts
    /// @param allocationId the id to fetch the balance for
    /// @return returns the result of the executed lookup data registered for the provided id
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
        Data memory data = _allocationData[allocationId];
        bytes memory returnData = executeView(data);

        uint256 _balance;
        assembly {
            _balance := mload(add(returnData, 0x20))
        }

        return _balance;
    }

    /// @notice Returns the token symbol registered under an id
    /// @param allocationId the id to fetch the token for
    /// @return returns the result of the token symbol registered for the provided id
    function symbolOf(bytes32 allocationId)
        external
        view
        override
        returns (string memory)
    {
        return _allocationSymbols[allocationId];
    }

    /// @notice Returns the decimals registered under an id
    /// @param allocationId the id to fetch the decimals for
    /// @return returns the result of the decimal value registered for the provided id
    function decimalsOf(bytes32 allocationId)
        external
        view
        override
        returns (uint256)
    {
        return _allocationDecimals[allocationId];
    }

    /// @notice Executes data's bytes look up data against data's target address
    /// @dev execution is a static call
    /// @param data the data hash containing the target address and the bytes lookup data to execute
    /// @return returns return data from the executed contract
    function executeView(Data memory data)
        public
        view
        returns (bytes memory returnData)
    {
        returnData = _staticcall(data.target, data.data);
    }

    function _staticcall(address target, bytes memory data)
        private
        view
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = target.staticcall(data);
        if (success) {
            return returndata;
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly

                // solhint-disable-next-line no-inline-assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("STATIC_CALL_FAILED");
            }
        }
    }
}
