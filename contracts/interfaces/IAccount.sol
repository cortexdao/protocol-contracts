// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "./IExecutor.sol";

interface IAccount {
    function execute(IExecutor.Data[] memory steps) external;
}
