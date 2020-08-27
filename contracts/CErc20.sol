// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

interface CErc20 {
    function mint(uint256) external returns (uint256);

    function redeem(uint256) external returns (uint256);

    function redeemUnderlying(uint256) external returns (uint256);

    function borrowBalanceCurrent(address account) external returns (uint256);

    function borrowRatePerBlock() external returns (uint256);

    function borrow(uint256 borrowAmount) external returns (uint256);

    function repayBorrow(uint256 repayAmount) external returns (uint256);

    function balanceOf(address owner) external view returns (uint256);
}
