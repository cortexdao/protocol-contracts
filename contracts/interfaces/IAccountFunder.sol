// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IAccountFunder {
    struct PoolAmount {
        bytes32 poolId;
        uint256 amount;
    }

    function fundAccount(bytes32 accountId, PoolAmount[] calldata poolAmounts)
        external;

    function withdrawFromAccount(
        bytes32 accountId,
        PoolAmount[] calldata poolAmounts
    ) external;
}
