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
import {FixedPoint} from "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import {IOneSplit} from "./IOneSplit.sol";

contract APYManager is Ownable, ReentrancyGuard, Pausable {
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    IOneSplit private _oneInch;

    uint256 private _oneInchParts = 10;
    uint256 private _oneInchFlags = 0;

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function setOneInchAddress(address oneInch) public onlyOwner {
        _oneInch = IOneSplit(oneInch);
    }

    function setOneInchParts(uint256 oneInchParts) public onlyOwner {
        _oneInchParts = oneInchParts;
    }

    function setOneInchFlags(uint256 oneInchFlags) public onlyOwner {
        _oneInchFlags = oneInchFlags;
    }

    function _swap(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount,
        uint16 slippage
    ) internal returns (uint256) {
        require(0 < slippage, "Slippage must be positive.");

        (uint256 returnAmount, uint256[] memory distribution) = _oneInch
            .getExpectedReturn(
            fromToken,
            destToken,
            amount,
            _oneInchParts,
            _oneInchFlags
        );

        uint256 minReturn = _amountWithSlippage(returnAmount, slippage);

        uint256 ethAmount = 0;
        if (address(fromToken) == address(0)) {
            ethAmount = amount;
        }

        uint256 receivedAmount = _oneInch.swap{value: ethAmount}(
            fromToken,
            destToken,
            amount,
            minReturn,
            distribution,
            _oneInchFlags
        );
        return receivedAmount;
    }

    function _amountWithSlippage(uint256 amount, uint16 slippage)
        internal
        pure
        returns (uint256)
    {
        FixedPoint.uq112x112 memory slippagePercentage = FixedPoint.fraction(
            uint112(slippage),
            uint112(10000)
        );
        uint256 slippageLoss = slippagePercentage
            .mul(uint112(amount))
            .decode144();

        uint256 reducedAmount = amount.sub(slippageLoss);
        assert(reducedAmount > 0);
        assert(reducedAmount < amount);

        return reducedAmount;
    }
}

contract APYManagerTestProxy is APYManager {
    function swap(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount,
        uint16 slippage
    ) public returns (uint256) {
        return _swap(fromToken, destToken, amount, slippage);
    }
}
