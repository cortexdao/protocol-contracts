// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {INameIdentifier, IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";
import {
    IOldStableSwap4
} from "contracts/protocols/curve/interfaces/IOldStableSwap4.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    OldCurveAllocationBase4
} from "contracts/protocols/curve/allocations/OldCurve4.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveSusdV2Constants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-susdv2";

    address public constant STABLE_SWAP_ADDRESS =
        0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;
    address public constant LP_TOKEN_ADDRESS =
        0xC25a3A3b969415c80451098fa907EC722572917F;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xA90996896660DEcC6E997655E065b23788857849;

    address public constant SUSD_ADDRESS =
        0x57Ab1ec28D129707052df4dF418D58a2D46d5f51;
}

contract CurveSusdV2Allocation is
    OldCurveAllocationBase4,
    ImmutableAssetAllocation,
    CurveSusdV2Constants
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
                IOldStableSwap4(STABLE_SWAP_ADDRESS),
                ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS),
                IERC20(LP_TOKEN_ADDRESS),
                tokenIndex
            );
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](4);
        tokens[0] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[2] = TokenData(USDT_ADDRESS, "USDT", 6);
        tokens[3] = TokenData(SUSD_ADDRESS, "sUSD", 18);
        return tokens;
    }
}
