// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface ILpSafeFunder {
    // struct representing the pool and the amount to move when funding an account
    // poolId represents the pool to move funds from
    // amount represents the amount to move when funding
    struct PoolAmount {
        bytes32 poolId;
        int256 amount;
    }

    function rebalanceReserves(bytes32[] calldata pools) external;

    function fundLpSafe(PoolAmount[] calldata poolAmounts) external;

    function withdrawFromLpSafe(PoolAmount[] calldata poolAmounts) external;
}
