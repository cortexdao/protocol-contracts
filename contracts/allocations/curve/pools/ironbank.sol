// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImmutableAssetAllocation} from "contracts/ImmutableAssetAllocation.sol";
import {
    IStableSwap
} from "contracts/allocations/curve/interfaces/IStableSwap.sol";
import {
    ILiquidityGauge
} from "contracts/allocations/curve/interfaces/ILiquidityGauge.sol";
import {CurveAllocationBase} from "contracts/allocations/curve/Curve.sol";

contract CurveIronBankConstants {
    address public constant STABLE_SWAP_ADDRESS =
        0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF;
    address public constant LP_TOKEN_ADDRESS =
        0x5282a4eF67D9C33135340fB3289cc1711c13638C;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xF5194c3325202F456c95c1Cf0cA36f8475C1949F;

    // underlyers
    address public constant CYDAI_ADDRESS =
        0x8e595470Ed749b85C6F7669de83EAe304C2ec68F;
    address public constant CYUSDC_ADDRESS =
        0x76Eb2FE28b36B3ee97F3Adae0C69606eeDB2A37c;
    address public constant CYUSDT_ADDRESS =
        0x48759F220ED983dB51fA7A8C0D2AAb8f3ce4166a;
}

contract CurveIronBankAllocation is
    CurveAllocationBase,
    ImmutableAssetAllocation,
    CurveIronBankConstants
{
    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        return
            super.getUnderlyerBalance(
                account,
                IStableSwap(STABLE_SWAP_ADDRESS),
                ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS),
                IERC20(LP_TOKEN_ADDRESS),
                uint256(tokenIndex)
            );
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](3);
        tokens[0] = TokenData(CYDAI_ADDRESS, "cyDAI", 8);
        tokens[1] = TokenData(CYUSDC_ADDRESS, "cyUSDC", 8);
        tokens[2] = TokenData(CYUSDT_ADDRESS, "cyUSDT", 8);
        return tokens;
    }
}
