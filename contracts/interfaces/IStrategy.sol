// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

interface IStrategy {
    function initialize(address generalExecutor) external;

    function execute(bytes calldata steps) external;
}
