// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20} from "contracts/common/Imports.sol";
import {SafeERC20, SafeMath} from "contracts/libraries/Imports.sol";

import {IERC4626} from "./Imports.sol";
import {ICurve3Pool} from "./ICurve3Pool.sol";

/**
 * @notice Helper contract to swap from DAI/USDC/Tether to 3Pool token
 * and then deposit for index tokens.
 */
contract DepositZap {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    address public constant CURVE_3POOL =
        0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    address public constant CURVE_3CRV =
        0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

    address public immutable indexToken;

    mapping(uint256 => address) public underlyers;

    constructor(address indexToken_) public {
        indexToken = indexToken_;

        underlyers[0] = DAI;
        underlyers[1] = USDC;
        underlyers[2] = USDT;
    }

    /**
     * @notice deposit 3Pool underlyer amount for index shares
     * @dev user must approve deposit zap for underlyer to transfer
     * @param amount the amount of 3Pool underlyer
     * @param index the index specifying 3Pool underlyer
     */
    function deposit(uint256 amount, uint8 index) external {
        require(index < 3, "INVALID_INDEX");

        // user must have approved zap for 3Pool underlyer
        _addLiquidityOneCoin(amount, index, 0);

        uint256 lpAmount = IDetailedERC20(CURVE_3CRV).balanceOf(address(this));

        // must approve index token so we can deposit 3CRV
        IDetailedERC20(CURVE_3CRV).safeApprove(indexToken, 0);
        IDetailedERC20(CURVE_3CRV).safeApprove(indexToken, lpAmount);

        IERC4626(indexToken).deposit(lpAmount, msg.sender);
    }

    /**
     * @notice redeem index shares for specified 3Pool underlyer
     * @dev user must approve deposit zap for index token to burn
     * @param shares the amount of index token shares
     * @param index the index specifying 3Pool underlyer
     */
    function redeem(uint256 shares, uint8 index) external {
        require(index < 3, "INVALID_INDEX");

        // user must have approved zap for index tokens
        IERC4626(indexToken).redeem(shares, address(this), msg.sender);

        uint256 lpAmount = IDetailedERC20(CURVE_3CRV).balanceOf(address(this));
        ICurve3Pool(CURVE_3POOL).remove_liquidity_one_coin(lpAmount, index, 0);

        address token = underlyers[index];
        uint256 tokenBalance = IDetailedERC20(token).balanceOf(address(this));
        IDetailedERC20(token).safeTransfer(msg.sender, tokenBalance);
    }

    function _addLiquidityOneCoin(
        uint256 amount,
        uint256 index,
        uint256 minAmount
    ) internal {
        require(index < 3, "INVALID_INDEX");

        address token = underlyers[index];
        IDetailedERC20(token).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        IDetailedERC20(token).safeApprove(CURVE_3POOL, 0);
        IDetailedERC20(token).safeApprove(CURVE_3POOL, amount);

        uint256[3] memory amounts;
        amounts[index] = amount;
        _addLiquidity(amounts, minAmount);
    }

    function _addLiquidity(uint256[3] memory amounts, uint256 minAmount)
        internal
    {
        ICurve3Pool(CURVE_3POOL).add_liquidity(
            [amounts[0], amounts[1], amounts[2]],
            minAmount
        );
    }
}
