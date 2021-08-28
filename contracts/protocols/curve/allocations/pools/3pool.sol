// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {INameIdentifier, IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";

import {IStableSwap, ILiquidityGauge} from "contracts/protocols/curve/Imports.sol";

import {CurveAllocationBase} from "contracts/protocols/curve/allocations/Curve.sol";

abstract contract Curve3PoolUnderlyerConstants {
    // underlyer addresses
    address public constant DAI_ADDRESS =
        0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC_ADDRESS =
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT_ADDRESS =
        0xdAC17F958D2ee523a2206206994597C13D831ec7;
}

abstract contract Curve3PoolConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-3pool";

    address public constant STABLE_SWAP_ADDRESS =
        0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    address public constant LP_TOKEN_ADDRESS =
        0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A;
}

contract Curve3PoolAllocation is
    CurveAllocationBase,
    ImmutableAssetAllocation,
    Curve3PoolConstants
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
        tokens[0] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[2] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
