// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

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
    event AddLiquidityLocked();
    event AddLiquidityUnlocked();
    event RedeemLocked();
    event RedeemUnlocked();

    function addLiquidity(uint256 amount, IERC20 token) external;

    function redeem(uint256 tokenAmount, IERC20 token) external;
}
