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
import {IStrategy, Asset} from "./APYStrategy.sol";
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
    IOneSplit private _oneInch;

    uint256 private _oneInchParts = 10;
    uint256 private _oneInchFlags = 0;

    event OneInchConfigChanged(string name, address changer, uint256 param);
    event AssetsSwapped(
        address fromAsset,
        address toAsset,
        uint256 fromAmount,
        uint256 toAmount
    );
    event StrategyChanged(address changer, string name, address strategy);
    event PoolChanged(address changer, address pool);

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function rebalance() external returns (uint256[] memory) {
        Asset[] memory inputAssets = _strategy.inputAssets();
        uint256 unusedAmount = _pool.drain();

        uint256[] memory receivedAmounts = new uint256[](inputAssets.length);
        for (uint256 i = 0; i < inputAssets.length; i++) {
            Asset memory asset = inputAssets[i];
            IERC20 token = asset.token;
            uint256 proportion = asset.proportion;
            uint256 amount;
            if (i == inputAssets.length - 1) {
                // logic for single asset or last asset of multiple
                // to avoid precision errors
                amount = address(this).balance;
            } else {
                FixedPoint.uq192x64 memory percentage = FixedPoint.fraction(
                    uint192(proportion),
                    uint192(100)
                );
                amount = percentage.mul(unusedAmount).decode();
            }
            receivedAmounts[i] = _swap(IERC20(address(0)), token, amount);
        }
        return receivedAmounts;
    }

    function setOneInchAddress(address oneInch) public onlyOwner {
        _oneInch = IOneSplit(oneInch);
        emit OneInchConfigChanged("address", msg.sender, uint256(oneInch));
    }

    function setOneInchParts(uint256 oneInchParts) public onlyOwner {
        _oneInchParts = oneInchParts;
        emit OneInchConfigChanged("parts", msg.sender, oneInchParts);
    }

    function setOneInchFlags(uint256 oneInchFlags) public onlyOwner {
        _oneInchFlags = oneInchFlags;
        emit OneInchConfigChanged("flags", msg.sender, oneInchFlags);
    }

    function setStrategy(address strategy) public onlyOwner {
        _strategy = IStrategy(strategy);
        emit StrategyChanged(msg.sender, _strategy.name(), strategy);
    }

    function setPool(address payable pool) public onlyOwner {
        _pool = ILiquidityPool(pool);
        emit PoolChanged(msg.sender, pool);
    }

    function _swap(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount
    ) internal returns (uint256) {
        (uint256 returnAmount, uint256[] memory distribution) = _oneInch
            .getExpectedReturn(
            fromToken,
            destToken,
            amount,
            _oneInchParts,
            _oneInchFlags
        );

        uint256 ethAmount = 0;
        if (address(fromToken) == address(0)) {
            // to swap from ETH, send amount as value
            ethAmount = amount;
        } else {
            // to swap from ERC20, must approve first
            IERC20(fromToken).approve(address(_oneInch), amount);
        }

        uint256 receivedAmount = _oneInch.swap{value: ethAmount}(
            fromToken,
            destToken,
            amount,
            returnAmount,
            distribution,
            _oneInchFlags
        );

        emit AssetsSwapped(
            address(fromToken),
            address(destToken),
            amount,
            receivedAmount
        );

        return receivedAmount;
    }
}

/**
 * @dev Proxy contract to test internal variables and functions
 *      Should not be used other than in test files!
 */
contract APYManagerTestProxy is APYManager {
    function swap(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount
    ) public returns (uint256) {
        return _swap(fromToken, destToken, amount);
    }
}
