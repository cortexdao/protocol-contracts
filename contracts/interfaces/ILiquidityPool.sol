// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

interface ILiquidityPool {
    event DepositedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount,
        uint256 totalValueLocked
    );
    event RedeemedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount,
        uint256 totalValueLocked
    );
    event TokenSupported(address token, address agg);
    event TokenUnsupported(address token, address agg);
    event AddLiquidityLocked();
    event AddLiquidityUnlocked();
    event RedeemLocked();
    event RedeemUnlocked();

    function addLiquidity(uint256 amount) external;

    function redeem(uint256 tokenAmount) external;
}
