// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {FixedPoint} from "solidity-fixedpoint/contracts/FixedPoint.sol";
import {IOneSplit} from "./IOneSplit.sol";
import {IStrategy} from "./IStrategy.sol";
import {ILiquidityPool} from "./APYLiquidityPool.sol";

/**
 * @notice APY Manager executes the current strategy.  It must
 *         keep track of the strategy, transfer assets from the
 *         liquidity pool, and swap assets through DEXes whenever
 *         rebalancing is required.
 */
contract APYManager is Ownable, ReentrancyGuard, Pausable {
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    ILiquidityPool private _pool;
    IStrategy private _strategy;

    event StrategyChanged(address changer, address strategy);
    event PoolChanged(address changer, address pool);

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function enterStrategy() external {
        //
    }

    function exitStrategy() external {
        //
    }

    function rebalance() external returns (uint256[] memory) {
        uint256 unusedAmount = _pool.drain();
        _strategy.rebalance{value:unusedAmount}();
    }

    function setStrategy(address payable strategy) public onlyOwner {
        _strategy = IStrategy(strategy);
        emit StrategyChanged(msg.sender, strategy);
    }

    function setPool(address payable pool) public onlyOwner {
        _pool = ILiquidityPool(pool);
        emit PoolChanged(msg.sender, pool);
    }
}
