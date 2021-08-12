// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImmutableAssetAllocation} from "../../ImmutableAssetAllocation.sol";
import {IMetaPool} from "./interfaces/IMetaPool.sol";
import {ILiquidityGauge} from "./interfaces/ILiquidityGauge.sol";
import {MetaPoolAllocationBase} from "./metapool.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

contract CurveUstConstants is Curve3PoolUnderlyerConstants {
    address public constant META_POOL_ADDRESS =
        0x890f4e345B1dAED0367A877a1612f86A1f86985f;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x94e131324b6054c0D789b190b2dAC504e4361b53;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0xa47c8bf37f92aBed4A126BDA807A7b7498661acD;
}

contract CurveUstAllocation is
    MetaPoolAllocationBase,
    ImmutableAssetAllocation,
    CurveUstConstants
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
        tokens[0] = TokenData(PRIMARY_UNDERLYER_ADDRESS, "UST", 18);
        tokens[1] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[2] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[3] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
