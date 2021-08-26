// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IReservePool} from "contracts/pool/Imports.sol";

interface ILpFunder {
    event FundLp(bytes32[] poolIds, uint256[] amounts);
    event WithdrawLp(bytes32[] poolIds, uint256[] amounts);
    event EmergencyFundLp(IReservePool[] pools, uint256[] amounts);
    event EmergencyWithdrawLp(IReservePool[] pools, uint256[] amounts);

    function fundLp(bytes32[] calldata pools) external;

    function emergencyFundLp(
        IReservePool[] calldata pools,
        uint256[] calldata amounts
    ) external;

    function withdrawLp(bytes32[] calldata pools) external;

    function emergencyWithdrawLp(
        IReservePool[] calldata pools,
        uint256[] calldata amounts
    ) external;
}
