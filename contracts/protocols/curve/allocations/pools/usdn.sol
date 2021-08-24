// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INameIdentifier} from "contracts/interfaces/INameIdentifier.sol";
import {ImmutableAssetAllocation} from "contracts/ImmutableAssetAllocation.sol";
import {IMetaPool} from "contracts/protocols/curve/interfaces/IMetaPool.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    MetaPoolAllocationBase
} from "contracts/protocols/curve/allocations/metapool.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveUsdnConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-usdn";

    address public constant META_POOL_ADDRESS =
        0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x4f3E8F405CF5aFC05D68142F3783bDfE13811522;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x674C6Ad92Fd080e4004b2312b45f796a192D27a0;
}

contract CurveUsdnAllocation is
    MetaPoolAllocationBase,
    ImmutableAssetAllocation,
    CurveUsdnConstants
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
        tokens[0] = TokenData(PRIMARY_UNDERLYER_ADDRESS, "USDN", 18);
        tokens[1] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[2] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[3] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
