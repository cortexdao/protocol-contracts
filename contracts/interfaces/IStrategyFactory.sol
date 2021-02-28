// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYGenericExecutor.sol";

interface IStrategyFactory {
    struct StrategyAllocation {
        bytes32[] poolIds;
        uint256[] amounts;
    }

    function deployStrategy(address generalExecutor) external returns (address);

    function isStrategyDeployed(address strategy) external returns (bool);

    function fundStrategy(
        address strategy,
        StrategyAllocation calldata allocation
    ) external;

    function fundAndExecute(
        address strategy,
        StrategyAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps
    ) external;

    function execute(address strategy, APYGenericExecutor.Data[] memory steps)
        external;

    function executeAndWithdraw(
        address strategy,
        StrategyAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps
    ) external;

    function withdrawFromStrategy(
        address strategy,
        StrategyAllocation calldata allocation
    ) external;
}
