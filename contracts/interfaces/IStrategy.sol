// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYGenericExecutor.sol";

interface IStrategy {
    function initialize(address generalExecutor) external;

    function execute(APYGenericExecutor.Data[] memory steps) external;
}
