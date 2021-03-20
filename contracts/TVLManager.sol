// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/EnumerableSet.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/ITVLManager.sol";

/**
 * @title TVL Manager
 * @author APY.Finance
 * @notice This contract allows registration of asset allocations
 *         expected to arise from movement of capital through
 *         the system such as funding or execution of strategies.
 *
 *         Information on registered allocations, such as balances,
 *         can then be pulled by external systems to compute the
 *         TVL of the APY.Finance system.
 */
contract TVLManager is Ownable, ITVLManager, IAssetAllocation {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public poolManager;
    address public accountManager;

    EnumerableSet.Bytes32Set private _allocationIds;
    mapping(bytes32 => Data) private _allocationData;
    mapping(bytes32 => string) private _allocationSymbols;
    mapping(bytes32 => uint256) private _allocationDecimals;

    event PoolManagerChanged(address);
    event AccountManagerChanged(address);

    constructor(address poolManagerAddress, address accountManagerAddress)
        public
    {
        require(poolManagerAddress != address(0), "INVALID_MANAGER");
        require(accountManagerAddress != address(0), "INVALID_MANAGER");
        setPoolManagerAddress(poolManagerAddress);
        setAccountManagerAddress(accountManagerAddress);
    }

    function setPoolManagerAddress(address _manager) public onlyOwner {
        require(_manager != address(0), "INVALID_MANAGER");
        poolManager = _manager;
        emit PoolManagerChanged(_manager);
    }

    function setAccountManagerAddress(address _manager) public onlyOwner {
        require(_manager != address(0), "INVALID_MANAGER");
        accountManager = _manager;
        emit AccountManagerChanged(_manager);
    }

    /**
     * @dev Throws if non-permissioned account calls.  Access list for
     *      now includes the deployer (owner), pool manager, and account manager.
     */
    modifier onlyPermissioned() {
        require(
            msg.sender == owner() ||
                msg.sender == poolManager ||
                msg.sender == accountManager,
            "PERMISSIONED_ONLY"
        );
        _;
    }

    /**
     * @notice Registers an allocation for use with the `balanceOf` functionality.
     * @dev Has O(n) time complexity, where n is the total size of `data`.
     */
    function addAssetAllocation(
        Data memory data,
        string calldata symbol,
        uint256 decimals
    ) external override onlyPermissioned {
        require(!isAssetAllocationRegistered(data), "DUPLICATE_DATA_DETECTED");
        bytes32 dataHash = keccak256(abi.encodePacked(data.target, data.data));
        _allocationIds.add(dataHash);
        _allocationData[dataHash] = data;
        _allocationSymbols[dataHash] = symbol;
        _allocationDecimals[dataHash] = decimals;
    }

    /**
     * @notice Deregisters an allocation for use with the `balanceOf` functionality.
     * @dev Has O(n) time complexity, where n is the total size of allocation data.
     */
    function removeAssetAllocation(Data memory data)
        external
        override
        onlyPermissioned
    {
        require(isAssetAllocationRegistered(data), "ALLOCATION_DOES_NOT_EXIST");
        bytes32 dataHash = keccak256(abi.encodePacked(data.target, data.data));
        _allocationIds.remove(dataHash);
        delete _allocationData[dataHash];
        delete _allocationSymbols[dataHash];
        delete _allocationDecimals[dataHash];
    }

    /**
     * @notice Returns true/false indicating if allocation is registered.
     * @dev Operation is O(1) in time complexity.
     */
    function isAssetAllocationRegistered(Data memory data)
        public
        view
        override
        returns (bool)
    {
        return
            _isAssetAllocationRegistered(
                keccak256(abi.encodePacked(data.target, data.data))
            );
    }

    function _isAssetAllocationRegistered(bytes32 data)
        public
        view
        returns (bool)
    {
        return _allocationIds.contains(data);
    }

    /**
     * @notice Returns the list of identifiers used by the other functions
     *         to pull asset info.
     *
     *         Each identifier represents a token and information on
     *         how it is placed within the system.
     *
     *         Note that the list has no duplicates, but a token may have
     *         multiplier identifiers since it may be placed in different
     *         parts of the system.
     *
     * @dev Identifiers are added during Account deployments.
     * @return List of identifiers
     */
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

    /**
     * @notice Returns the balance represented by the identifier, i.e.
     *         the token balance held in a specific part of the system.
     * @dev The balance may be aggregated from multiple contracts holding
     *      the token and also may result from a series of calculations.
     * @param allocationId identifier for a token placed in the system
     * @return token balance represented by the identifer
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
        Data memory data = _allocationData[allocationId];
        bytes memory returnData = executeView(data);

        uint256 _balance;
        assembly {
            _balance := mload(add(returnData, 0x20))
        }

        return _balance;
    }

    /**
     * @notice Returns the symbol of the token represented by the identifier.
     * @param allocationId identifier for a token placed in the system
     * @return the token symbol
     */
    function symbolOf(bytes32 allocationId)
        external
        view
        override
        returns (string memory)
    {
        return _allocationSymbols[allocationId];
    }

    /**
     * @notice Returns the decimals of the token represented by the identifier.
     * @param allocationId Identifier for a token placed in the system
     * @return The token decimals
     */
    function decimalsOf(bytes32 allocationId)
        external
        view
        override
        returns (uint256)
    {
        return _allocationDecimals[allocationId];
    }

    /**
     * @notice Executes code to return a result from a smart contract function,
     *         without modifying the internal state of the contract.
     * @dev The execution is via static call, meaning no state changes can arise.
     * @param data a struct holding the target and data of the static call
     * See ITVLManager.Data.
     */
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
