// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {INameIdentifier, IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";

import {CTokenInterface, IStableSwap, ILiquidityGauge} from "contracts/protocols/curve/Imports.sol";

import {CurveAllocationBase} from "contracts/protocols/curve/allocations/Imports.sol";

import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveIronBankConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-ironbank";

    address public constant STABLE_SWAP_ADDRESS =
        0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF;
    address public constant LP_TOKEN_ADDRESS =
        0x5282a4eF67D9C33135340fB3289cc1711c13638C;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xF5194c3325202F456c95c1Cf0cA36f8475C1949F;
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
        uint256 cyBalance = super.getUnderlyerBalance(
            account,
            IStableSwap(STABLE_SWAP_ADDRESS),
            ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS),
            IERC20(LP_TOKEN_ADDRESS),
            uint256(tokenIndex)
        );
        return unwrapBalance(cyBalance, tokenIndex);
    }

    function unwrapBalance(uint256 balance, uint8 tokenIndex)
        public
        view
        returns (uint256)
    {
        IStableSwap pool = IStableSwap(STABLE_SWAP_ADDRESS);
        CTokenInterface cyToken = CTokenInterface(pool.coins(tokenIndex));
        return balance.mul(cyToken.exchangeRateStored());
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](3);
        tokens[0] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[2] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
