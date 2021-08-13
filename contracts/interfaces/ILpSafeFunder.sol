// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {PoolTokenV2} from "../PoolTokenV2.sol";

interface ILpSafeFunder {
    // struct representing the pool and the amount to move when funding an account
    // poolId represents the pool to move funds from
    // amount represents the amount to move when funding
    struct PoolAmount {
        PoolTokenV2 pool;
        uint256 amount;
    }

    function rebalanceReserves(bytes32[] calldata pools) external;

    function emergencyRebalanceReserves(
        ILpSafeFunder.PoolAmount[] calldata depositAmounts,
        ILpSafeFunder.PoolAmount[] calldata withdrawAmounts
    ) external;
}
