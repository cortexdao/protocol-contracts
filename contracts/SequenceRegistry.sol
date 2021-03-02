// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/EnumerableSet.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/ISequenceRegistry.sol";
import "./interfaces/IStrategyFactory.sol";
import "./APYViewExecutor.sol";

contract SequenceRegistry is Ownable, ISequenceRegistry, IAssetAllocation {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    IStrategyFactory public manager;
    APYViewExecutor public executor;

    // Needs to be able to delete sequenceIds and sequences
    EnumerableSet.Bytes32Set private _sequenceIds;
    mapping(bytes32 => APYViewExecutor.Data[]) private _sequenceData;
    mapping(bytes32 => string) private _sequenceSymbols;

    event ManagerChanged(address);
    event ExecutorChanged(address);

    constructor(address managerAddress, address executorAddress) public {
        require(managerAddress != address(0), "INVALID_MANAGER");
        require(executorAddress != address(0), "INVALID_EXECUTOR");

        setManagerAddress(managerAddress);
        setExecutorAddress(executorAddress);
    }

    function setManagerAddress(address managerAddress) public onlyOwner {
        require(managerAddress != address(0), "INVALID_MANAGER");
        manager = IStrategyFactory(managerAddress);
        emit ManagerChanged(managerAddress);
    }

    function setExecutorAddress(address executorAddress) public onlyOwner {
        require(executorAddress != address(0), "INVALID_EXECUTOR");
        executor = APYViewExecutor(executorAddress);
        emit ExecutorChanged(executorAddress);
    }

    /**
     * @notice Registers a sequence for use with the `balanceOf` functionality.
     * @dev Has O(n) time complexity, where n is the total size of `data`.
     */
    function addSequence(
        bytes32 sequenceId,
        APYViewExecutor.Data[] memory data,
        string calldata symbol
    ) external override onlyOwner {
        _sequenceIds.add(sequenceId);
        _sequenceSymbols[sequenceId] = symbol;

        for (uint256 i = 0; i < data.length; i++) {
            _sequenceData[sequenceId].push(data[i]);
        }
    }

    /**
     * @notice Deregisters a sequence for use with the `balanceOf` functionality.
     * @dev Has O(n) time complexity, where n is the total size of sequence data.
     */
    function removeSequence(bytes32 sequenceId) external override onlyOwner {
        delete _sequenceData[sequenceId];
        delete _sequenceSymbols[sequenceId];
        _sequenceIds.remove(sequenceId);
    }

    /**
     * @notice Returns true/false indicating if sequence is registered.
     * @dev Operation is O(1) in time complexity.
     */
    function isSequenceRegistered(bytes32 sequenceId)
        public
        view
        override
        returns (bool)
    {
        return _sequenceIds.contains(sequenceId);
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
    function getSequenceIds()
        external
        view
        override
        returns (bytes32[] memory)
    {
        uint256 length = _sequenceIds.length();
        bytes32[] memory sequenceIds = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            sequenceIds[i] = _sequenceIds.at(i);
        }
        return sequenceIds;
    }

    /**
     * @notice Returns the balance represented by the identifier, i.e.
     *         the token balance held in a specific part of the system.
     * @dev The balance may be aggregated from multiple contracts holding
     *      the token and also may result from a series of calculations.
     * @param sequenceId identifier for a token placed in the system
     * @return token balance represented by the identifer
     */
    function balanceOf(bytes32 sequenceId)
        external
        view
        override
        returns (uint256)
    {
        // Should check if the sequence ID exists first
        bytes memory returnData =
            executor.executeView(_sequenceData[sequenceId]);

        uint256 _balance;
        assembly {
            _balance := mload(add(returnData, 0x20))
        }

        return _balance;
    }

    /**
     * @notice Returns the symbol of the token represented by the identifier.
     * @param sequenceId identifier for a token placed in the system
     * @return the token symbol
     */
    function symbolOf(bytes32 sequenceId)
        external
        view
        override
        returns (string memory)
    {
        return _sequenceSymbols[sequenceId];
    }
}
