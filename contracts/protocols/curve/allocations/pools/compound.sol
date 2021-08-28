// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {INameIdentifier, IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";

import {CTokenInterface, IOldStableSwap2, ILiquidityGauge} from "contracts/protocols/curve/Imports.sol";

import {OldCurveAllocationBase2} from "contracts/protocols/curve/allocations/Imports.sol";

import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveCompoundConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-compound";

    address public constant STABLE_SWAP_ADDRESS =
        0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56;
    address public constant LP_TOKEN_ADDRESS =
        0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x7ca5b0a2910B33e9759DC7dDB0413949071D7575;
}

contract CurveCompoundAllocation is
    OldCurveAllocationBase2,
    ImmutableAssetAllocation,
    CurveCompoundConstants
{
    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        uint256 cyBalance = super.getUnderlyerBalance(
            account,
            IOldStableSwap2(STABLE_SWAP_ADDRESS),
            ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS),
            IERC20(LP_TOKEN_ADDRESS),
            tokenIndex
        );
        return unwrapBalance(cyBalance, tokenIndex);
    }

    function unwrapBalance(uint256 balance, uint8 tokenIndex)
        public
        view
        returns (uint256)
    {
        IOldStableSwap2 pool = IOldStableSwap2(STABLE_SWAP_ADDRESS);
        CTokenInterface cyToken = CTokenInterface(pool.coins(tokenIndex));
        return balance.mul(cyToken.exchangeRateStored());
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](2);
        tokens[0] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(USDC_ADDRESS, "USDC", 6);
        return tokens;
    }
}
