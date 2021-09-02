// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IReservePool} from "contracts/pool/Imports.sol";

interface ILpAccountFunder {
    event FundLpAccount(bytes32[] poolIds, uint256[] amounts);
    event WithdrawFromLpAccount(bytes32[] poolIds, uint256[] amounts);
    event EmergencyFundLpAccount(IReservePool[] pools, uint256[] amounts);
    event EmergencyWithdrawFromLpAccount(
        IReservePool[] pools,
        uint256[] amounts
    );

    function fundLpAccount(bytes32[] calldata pools) external;

    function emergencyFundLpAccount(
        IReservePool[] calldata pools,
        uint256[] calldata amounts
    ) external;

    function withdrawFromLpAccount(bytes32[] calldata pools) external;

    function emergencyWithdrawFromLpAccount(
        IReservePool[] calldata pools,
        uint256[] calldata amounts
    ) external;
}
