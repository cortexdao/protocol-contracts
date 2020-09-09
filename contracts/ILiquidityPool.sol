// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

interface ILiquidityPool {
    event DepositedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount
    );
    event RedeemedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount
    );

    function addLiquidity(uint256 amount) external;

    function redeem(uint256 tokenAmount) external;
}
