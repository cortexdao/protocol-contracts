// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYGenericExecutor.sol";

interface IStrategyFactory {
    function deploy(address generalExecutor) external returns (address);

    function registerTokens(address strategy, address[] calldata tokens)
        external;

    function transferAndExecute(
        address strategy,
        APYGenericExecutor.Data[] calldata steps
    ) external;

    function execute(address strategy, APYGenericExecutor.Data[] memory steps)
        external;
}
