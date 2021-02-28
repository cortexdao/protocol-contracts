// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYViewExecutor.sol";

/**
 * @title Interface for addition and removal of balance sequences
          for strategy deployments
 * @author APY.Finance
 * @notice These functions enable Chainlink to pull necessary info
 *         to compute the TVL of the APY.Finance system.
 */
interface ISequenceRegistry {
    function addSequence(
        bytes32 sequenceId,
        APYViewExecutor.Data[] calldata data,
        string calldata symbol
    ) external;

    function removeSequence(bytes32 sequenceId) external;

    function isSequenceRegistered(bytes32 sequenceId)
        external
        view
        returns (bool);
}
