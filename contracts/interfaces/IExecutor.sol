// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IExecutor {
    // struct representing an execution against a contracts given bytes data
    // target is the target contract to execute against
    // bytes data representing the encoded function signature + parameters
    struct Data {
        address target;
        bytes data;
    }

    function execute(Data[] memory steps) external payable;
}
