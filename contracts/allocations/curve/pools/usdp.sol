// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImmutableAssetAllocation} from "contracts/ImmutableAssetAllocation.sol";
import {IMetaPool} from "contracts/allocations/curve/interfaces/IMetaPool.sol";
import {
    ILiquidityGauge
} from "contracts/allocations/curve/interfaces/ILiquidityGauge.sol";
import {MetaPoolAllocationBase} from "contracts/allocations/curve/metapool.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveUsdpConstants is Curve3PoolUnderlyerConstants {
    address public constant META_POOL_ADDRESS =
        0x42d7025938bEc20B69cBae5A77421082407f053A;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x055be5DDB7A925BfEF3417FC157f53CA77cA7222;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x1456688345527bE1f37E9e627DA0837D6f08C925;
}

contract CurveUsdpAllocation is
    MetaPoolAllocationBase,
    ImmutableAssetAllocation,
    CurveUsdpConstants
{
    constructor(address curve3PoolAllocation_)
        public
        MetaPoolAllocationBase(curve3PoolAllocation_)
    {} // solhint-disable-line no-empty-blocks

    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        return
            super.getUnderlyerBalance(
                account,
                IMetaPool(META_POOL_ADDRESS),
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
        TokenData[] memory tokens = new TokenData[](4);
        tokens[0] = TokenData(PRIMARY_UNDERLYER_ADDRESS, "USDP", 18);
        tokens[1] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[2] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[3] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
