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
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {APYStrategy} from "./APYStrategy.sol";
import {CErc20} from "./CErc20.sol";
import {Comptroller} from "./Comptroller.sol";


/**
 * @notice Adds 1inch swap functionality to any contract
 *         that inherits this base contract.
 */
contract OneInchSwap is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for *;

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

    /// @dev contract must be able to receive ETH
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

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
