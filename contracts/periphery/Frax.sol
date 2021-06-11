// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Curve.sol";

/**
 * @notice the Curve metapool contract
 * @dev A metapool is its own LP token
 */
interface IMetaPool is IERC20 {
    /// @dev 1st coin is the protocol token, 2nd is the Curve base pool
    function balances(uint256 coin) external view returns (uint256);

    /// @dev the number of coins is hard-coded in curve contracts
    // solhint-disable-next-line
    function add_liquidity(uint256[2] memory amounts, uint256 min_mint_amount)
        external;

    /// @dev the number of coins is hard-coded in curve contracts
    // solhint-disable-next-line
    function remove_liquidity(uint256 _amount, uint256[3] memory min_amounts)
        external;

    // solhint-disable-next-line
    function remove_liquidity_one_coin(
        uint256 tokenAmount,
        int128 tokenIndex,
        uint256 minAmount
    ) external;
}

/**
 * @title Periphery Contract for the Curve Frax-3Pool metapool
 * @author APY.Finance
 * @notice This contract enables the APY.Finance system to retrieve the balance
 *         of an underlyer of a Curve LP token. The balance is used as part
 *         of the Chainlink computation of the deployed TVL.  The primary
 *         `getUnderlyerBalance` function is invoked indirectly when a
 *         Chainlink node calls `balanceOf` on the APYAssetAllocationRegistry.
 */
contract Frax3CrvPeriphery {
    using SafeMath for uint256;

    address public curve3Pool;
    address public curve3PoolGauge;
    address public curve3PoolPeriphery;

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
        // get the balance of 3Crv tokens
        return metaPool.balances(1);

        return
            curve3PoolPeriphery.getUnderlyerBalance(
                address(metaPool),
                curve3Pool,
                curve3PoolGauge,
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
