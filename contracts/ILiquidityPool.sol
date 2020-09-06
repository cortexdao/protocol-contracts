// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;


interface ILiquidityPool {
    function addLiquidity(uint256 amount) external;

    function redeem(uint256 tokenAmount) external;
}
