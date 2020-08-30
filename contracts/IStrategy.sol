// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IStrategy {
    function initiatePosition(uint256 amount) external;

    function rebalance() external payable;

    function closePosition() external;

    receive() external payable;
}
