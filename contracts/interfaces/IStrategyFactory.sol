// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

interface IStrategyFactory {
    function deploy(address generalExecutor) external returns (address);

    function registerTokens(address strategy, address[] calldata tokens)
        external;

    function transferAndExecute(address strategy, bytes calldata steps)
        external;

    function execute(address strategy, bytes calldata steps) external;
}
