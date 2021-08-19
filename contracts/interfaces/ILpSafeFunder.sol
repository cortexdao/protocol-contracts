// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {PoolTokenV2} from "../PoolTokenV2.sol";

interface ILpSafeFunder {
    function fundLp(bytes32[] calldata pools) external;

    function emergencyFundLp(
        PoolTokenV2[] calldata pools,
        uint256[] calldata amounts
    ) external;

    function withdrawLp(bytes32[] calldata pools) external;

    function emergencyWithdrawLp(
        PoolTokenV2[] calldata pools,
        uint256[] calldata amounts
    ) external;
}
