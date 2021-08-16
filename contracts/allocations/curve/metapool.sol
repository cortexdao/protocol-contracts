// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Curve3PoolAllocation} from "./pools/3pool.sol";
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
    Curve3PoolAllocation public immutable curve3PoolAllocation;

    constructor(address curve3PoolAllocation_) public {
        curve3PoolAllocation = Curve3PoolAllocation(curve3PoolAllocation_);
    }

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
        IERC20 lpToken,
        uint256 coin
    ) public view returns (uint256 balance) {
        require(address(metaPool) != address(0), "INVALID_POOL");
        require(address(gauge) != address(0), "INVALID_GAUGE");
        require(address(lpToken) != address(0), "INVALID_LP_TOKEN");

        uint256 poolBalance = getPoolBalance(metaPool, coin);
        (uint256 lpTokenBalance, uint256 lpTokenSupply) =
            getLpTokenShare(account, metaPool, gauge, lpToken);

        balance = lpTokenBalance.mul(poolBalance).div(lpTokenSupply);
    }

    function getPoolBalance(IMetaPool metaPool, uint256 coin)
        public
        view
        returns (uint256)
    {
        require(address(metaPool) != address(0), "INVALID_POOL");
        require(coin < 256, "INVALID_COIN");
        if (coin == 0) {
            return metaPool.balances(0);
        }
        coin -= 1;
        uint256 balance =
            curve3PoolAllocation.balanceOf(address(metaPool), uint8(coin));
        // renormalize using the pool's tracked 3Crv balance
        IERC20 baseLpToken = IERC20(metaPool.coins(1));
        uint256 adjustedBalance =
            balance.mul(metaPool.balances(1)).div(
                baseLpToken.balanceOf(address(metaPool))
            );
        return adjustedBalance;
    }

    function getLpTokenShare(
        address account,
        IMetaPool metaPool,
        ILiquidityGauge gauge,
        IERC20 lpToken
    ) public view returns (uint256 balance, uint256 totalSupply) {
        require(address(metaPool) != address(0), "INVALID_POOL");
        require(address(gauge) != address(0), "INVALID_GAUGE");
        require(address(lpToken) != address(0), "INVALID_LP_TOKEN");

        totalSupply = lpToken.totalSupply();
        balance = lpToken.balanceOf(account);
        balance = balance.add(gauge.balanceOf(account));
    }
}
