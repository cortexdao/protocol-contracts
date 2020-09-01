// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStrategy} from "./IStrategy.sol";
import {ILiquidityPool} from "./APYLiquidityPool.sol";

/**
 * @notice APY Manager executes the current strategy.  It must
 *         keep track of the strategy, transfer assets from the
 *         liquidity pool to the strategy contract, and choose
 *         strategy execution path.
 */
contract APYManager is Ownable, ReentrancyGuard, Pausable {

    ILiquidityPool private _pool;
    IStrategy private _strategy;

    event StrategyChanged(address changer, address strategy);
    event PoolChanged(address changer, address pool);

    event StrategyEntered(address changer, uint256 amount);
    event StrategyReinvested(address changer, uint256 amount);
    event StrategyExited(address changer);

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function enterStrategy() external onlyOwner {
        uint256 amount = _pool.drain();
        _strategy.enter{value:amount}();
        emit StrategyEntered(msg.sender, amount);
    }

    function exitStrategy() external onlyOwner {
        _strategy.exit();
        emit StrategyExited(msg.sender);
    }

    function reinvestStrategy() external nonReentrant whenNotPaused {
        uint256 unusedAmount = _pool.drain();
        _strategy.reinvest{value:unusedAmount}();
        emit StrategyReinvested(msg.sender, unusedAmount);
    }

    function setStrategyAddress(address payable strategy) public onlyOwner {
        _strategy = IStrategy(strategy);
        emit StrategyChanged(msg.sender, strategy);
    }

    function setPoolAddress(address payable pool) public onlyOwner {
        _pool = ILiquidityPool(pool);
        emit PoolChanged(msg.sender, pool);
    }
}
