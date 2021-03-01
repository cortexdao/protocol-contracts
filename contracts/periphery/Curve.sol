// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStableSwap {
    function balances(uint256 coin) external view returns (uint256);
    // solhint-disable-next-line func-name-mixedcase
    function lp_token() external view returns (address);
}

interface ILiquidityGauge {
    function balanceOf(address account) external view returns (uint256);
}

contract CurvePeriphery {
    using SafeMath for uint256;

    function getUnderlyingAsset(
        address account,
        IStableSwap stableSwap,
        uint256 coin
    )
        external
        view
        returns (uint256 balance)
    {
        uint256 totalBalance = stableSwap.balances(coin);
        IERC20 lpToken = IERC20(stableSwap.lp_token());
        balance = lpToken.balanceOf(account)
            .mul(totalBalance)
            .div(lpToken.totalSupply());
    }

    function getUnderlyingAssetFromGauge(
        address account,
        IStableSwap stableSwap,
        ILiquidityGauge gauge,
        uint256 coin
    )
        external
        view
        returns (uint256 balance)
    {
        uint256 totalBalance = stableSwap.balances(coin);
        IERC20 lpToken = IERC20(stableSwap.lp_token());
        balance = gauge.balanceOf(account)
            .mul(totalBalance)
            .div(lpToken.totalSupply());
    }
}
