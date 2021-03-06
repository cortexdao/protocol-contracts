// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStableSwap {
    function N_COINS() external view returns (int128); // solhint-disable-line func-name-mixedcase

    function balances(int256 coin) external view returns (uint256);

    /// @dev For newest curve pools like aave; older pools refer to a private `token` variable.
    function lp_token() external view returns (address); // solhint-disable-line func-name-mixedcase
}

interface ILiquidityGauge {
    function balanceOf(address account) external view returns (uint256);
}

contract CurvePeriphery {
    using SafeMath for uint256;

    function getUnderlyerBalance(
        address account,
        IStableSwap stableSwap,
        ILiquidityGauge gauge,
        int128 coin
    ) external view returns (uint256 balance) {
        require(address(stableSwap) != address(0), "INVALID_STABLESWAP");
        require(address(gauge) != address(0), "INVALID_GAUGE");

        uint256 poolBalance = getPoolBalance(stableSwap, coin);
        (uint256 lpTokenBalance, uint256 lpTokenSupply) =
            getLpTokenShare(account, stableSwap, gauge);

        balance = lpTokenBalance.mul(poolBalance).div(lpTokenSupply);
    }

    function getPoolBalance(IStableSwap stableSwap, int128 coin)
        public
        view
        returns (uint256)
    {
        require(address(stableSwap) != address(0), "INVALID_STABLESWAP");
        require(coin < stableSwap.N_COINS(), "INVALID_COIN");
        return stableSwap.balances(coin);
    }

    function getLpTokenShare(
        address account,
        IStableSwap stableSwap,
        ILiquidityGauge gauge
    ) public view returns (uint256 balance, uint256 totalSupply) {
        require(address(stableSwap) != address(0), "INVALID_STABLESWAP");
        require(address(gauge) != address(0), "INVALID_GAUGE");

        IERC20 lpToken = IERC20(stableSwap.lp_token());
        totalSupply = lpToken.totalSupply();
        balance = lpToken.balanceOf(account);
        balance = balance.add(gauge.balanceOf(account));
    }
}
