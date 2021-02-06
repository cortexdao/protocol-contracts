// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYGenericExecutor.sol";

interface IStrategyFactory {
    struct StrategyAllocation {
        address payable[] pools;
        uint256[] amounts;
    }

    function deploy(address generalExecutor) external returns (address);

    function registerTokens(address strategy, address[] calldata tokens)
        external;

    function fundAndExecute(
        address strategy,
        StrategyAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps
    ) external;

    function execute(address strategy, APYGenericExecutor.Data[] memory steps)
        external;
}
