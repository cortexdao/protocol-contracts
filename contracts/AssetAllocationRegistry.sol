// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/EnumerableSet.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAssetAllocationRegistry.sol";

contract AssetAllocationRegistry is
    Ownable,
    IAssetAllocationRegistry,
    IAssetAllocation
{
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public manager;

    EnumerableSet.Bytes32Set private _allocationIds;
    mapping(bytes32 => Data) private _allocationData;
    mapping(bytes32 => string) private _allocationSymbols;

    event ManagerChanged(address);

    constructor(address managerAddress) public {
        require(managerAddress != address(0), "INVALID_MANAGER");

        setManagerAddress(managerAddress);
    }

    function setManagerAddress(address _manager) public onlyOwner {
        require(_manager != address(0), "INVALID_MANAGER");
        manager = _manager;
        emit ManagerChanged(_manager);
    }

    modifier onlyPermissioned() {
        require(
            msg.sender == owner() || msg.sender == manager,
            "PERMISSIONED_ONLY"
        );
        _;
    }

    /**
     * @notice Registers a sequence for use with the `balanceOf` functionality.
     * @dev Has O(n) time complexity, where n is the total size of `data`.
     */
    function addAssetAllocation(
        bytes32 allocationId,
        Data memory data,
        string calldata symbol
    ) external override onlyPermissioned {
        _allocationIds.add(allocationId);
        _allocationSymbols[allocationId] = symbol;
        _allocationData[allocationId] = data;
    }

    /**
     * @notice Deregisters a sequence for use with the `balanceOf` functionality.
     * @dev Has O(n) time complexity, where n is the total size of sequence data.
     */
    function removeAssetAllocation(bytes32 allocationId)
        external
        override
        onlyPermissioned
    {
        delete _allocationData[allocationId];
        delete _allocationSymbols[allocationId];
        _allocationIds.remove(allocationId);
    }

    /**
     * @notice Returns true/false indicating if sequence is registered.
     * @dev Operation is O(1) in time complexity.
     */
    function isAssetAllocationRegistered(bytes32 allocationId)
        public
        view
        override
        returns (bool)
    {
        return _allocationIds.contains(allocationId);
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
     * @dev Identifiers are added during strategy deployments.
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
            isAssetAllocationRegistered(allocationId),
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
