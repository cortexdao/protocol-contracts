// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {PoolTokenV2} from "../PoolTokenV2.sol";

interface ILpFunder {
    event FundLp(bytes32[] poolIds, uint256[] amounts);
    event WithdrawLp(bytes32[] poolIds, uint256[] amounts);
    event EmergencyFundLp(PoolTokenV2[] pools, uint256[] amounts);
    event EmergencyWithdrawLp(PoolTokenV2[] pools, uint256[] amounts);

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
