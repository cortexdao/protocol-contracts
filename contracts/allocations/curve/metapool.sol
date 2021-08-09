// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CurveAllocationBase} from "./Curve.sol";
import {IMetaPool} from "./interfaces/IMetaPool.sol";
import {IStableSwap} from "./interfaces/IStableSwap.sol";
import {ILiquidityGauge} from "./interfaces/ILiquidityGauge.sol";

/**
 * @title Periphery Contract for a Curve metapool
 * @author APY.Finance
 * @notice This contract enables the APY.Finance system to retrieve the balance
 *         of an underlyer of a Curve LP token. The balance is used as part
 *         of the Chainlink computation of the deployed TVL.  The primary
 *         `getUnderlyerBalance` function is invoked indirectly when a
 *         Chainlink node calls `balanceOf` on the APYAssetAllocationRegistry.
 */
contract MetaPoolAllocationBase {
    using SafeMath for uint256;

    /// @dev all existing Curve metapools are paired with 3Pool
    IStableSwap public curve3Pool;
    ILiquidityGauge public curve3PoolGauge;
    CurveAllocationBase public curveAllocationBase;

    /**
     * @notice Returns the balance of an underlying token represented by
     *         an account's LP token balance.
     * @param metaPool the liquidity pool comprised of multiple underlyers
     * @param gauge the staking contract for the LP tokens
     * @param coin the index indicating which underlyer
     * @return balance
     */
    function getUnderlyerBalance(
        address account,
        IMetaPool metaPool,
        ILiquidityGauge gauge,
        uint256 coin
    ) external view returns (uint256 balance) {
        require(address(metaPool) != address(0), "INVALID_POOL");
        require(address(gauge) != address(0), "INVALID_GAUGE");

        uint256 poolBalance = getPoolBalance(metaPool, coin);
        (uint256 lpTokenBalance, uint256 lpTokenSupply) =
            getLpTokenShare(account, metaPool, gauge);

        balance = lpTokenBalance.mul(poolBalance).div(lpTokenSupply);
    }

    function getPoolBalance(IMetaPool metaPool, uint256 coin)
        public
        view
        returns (uint256)
    {
        require(address(metaPool) != address(0), "INVALID_POOL");
        return
            curveAllocationBase.getUnderlyerBalance(
                address(metaPool),
                curve3Pool,
                curve3PoolGauge,
                metaPool,
                coin
            );
    }

    function getLpTokenShare(
        address account,
        IMetaPool metaPool,
        ILiquidityGauge gauge
    ) public view returns (uint256 balance, uint256 totalSupply) {
        require(address(metaPool) != address(0), "INVALID_POOL");
        require(address(gauge) != address(0), "INVALID_GAUGE");

        totalSupply = metaPool.totalSupply();
        balance = metaPool.balanceOf(account);
        balance = balance.add(gauge.balanceOf(account));
    }
}
