// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IAccountFactory {
    function deployAccount(bytes32 accountId, address generalExecutor)
        external
        returns (address);

    function getAccount(bytes32 accountId) external returns (address);
}
