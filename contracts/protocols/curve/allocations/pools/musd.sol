// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImmutableAssetAllocation} from "contracts/ImmutableAssetAllocation.sol";
import {IMetaPool} from "contracts/protocols/curve/interfaces/IMetaPool.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    MetaPoolAllocationBase
} from "contracts/protocols/curve/allocations/metapool.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveMusdConstants is Curve3PoolUnderlyerConstants {
    address public constant META_POOL_ADDRESS =
        0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x1AEf73d49Dedc4b1778d0706583995958Dc862e6;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x5f626c30EC1215f4EdCc9982265E8b1F411D1352;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0xe2f2a5C287993345a840Db3B0845fbC70f5935a5;
}

contract CurveMusdAllocation is
    MetaPoolAllocationBase,
    ImmutableAssetAllocation,
    CurveMusdConstants
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
        tokens[0] = TokenData(PRIMARY_UNDERLYER_ADDRESS, "mUSD", 18);
        tokens[1] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[2] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[3] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
