// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

interface ILiquidityPool {
    receive() external payable;

    function addLiquidity() external payable;

    function redeem(uint256 tokenAmount) external;

    function drain() external returns (uint256 amount);

    function unused() external view returns (uint256 amount);
}
