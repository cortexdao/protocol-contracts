// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IStrategy {
    function enter() external payable;

    function reinvest() external payable;

    function exit() external;

    receive() external payable;
}
