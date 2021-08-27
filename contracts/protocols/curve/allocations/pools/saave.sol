// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {INameIdentifier, IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";
import {
    IStableSwap2
} from "contracts/protocols/curve/interfaces/IStableSwap2.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    CurveAllocationBase2
} from "contracts/protocols/curve/allocations/Curve2.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveSaaveConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-saave";

    address public constant STABLE_SWAP_ADDRESS =
        0xEB16Ae0052ed37f479f7fe63849198Df1765a733;
    address public constant LP_TOKEN_ADDRESS =
        0x02d341CcB60fAaf662bC0554d13778015d1b285C;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x462253b8F74B72304c145DB0e4Eebd326B22ca39;
}

contract CurveSaaveAllocation is
    CurveAllocationBase2,
    ImmutableAssetAllocation,
    CurveSaaveConstants
{
    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        // No unwrapping of aTokens are needed, as `balanceOf`
        // automagically reflects the accrued interest and
        // aTokens convert 1:1 to the underlyer.
        return
            super.getUnderlyerBalance(
                account,
                IStableSwap2(STABLE_SWAP_ADDRESS),
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
        TokenData[] memory tokens = new TokenData[](2);
        tokens[0] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(USDC_ADDRESS, "sUSD", 18);
        return tokens;
    }
}
