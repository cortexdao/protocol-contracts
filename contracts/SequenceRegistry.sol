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

    function removeSequence(bytes32 sequenceId) external override onlyOwner {
        delete _sequenceData[sequenceId];
        delete _sequenceSymbols[sequenceId];
        _sequenceIds.remove(sequenceId);
    }

    function isSequenceRegistered(bytes32 sequenceId)
        public
        view
        override
        returns (bool)
    {
        return _sequenceIds.contains(sequenceId);
    }

    /**
     * @notice Returns the list of sequenceIds.
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

    /** @notice Returns the total balance in the system for given token.
     *  @dev The balance is possibly aggregated from multiple contracts
     *       holding the token.
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

    /// @notice Returns the symbol of the given token.
    function symbolOf(bytes32 sequenceId)
        external
        view
        override
        returns (string memory)
    {
        return _sequenceSymbols[sequenceId];
    }
}
