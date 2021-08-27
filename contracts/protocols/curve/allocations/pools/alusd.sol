// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {INameIdentifier, IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";
import {IMetaPool} from "contracts/protocols/curve/interfaces/IMetaPool.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    MetaPoolAllocationBase
} from "contracts/protocols/curve/allocations/metapool.sol";
import {Curve3PoolUnderlyerConstants} from "./3pool.sol";

abstract contract CurveAlUsdConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-alusd";

    address public constant META_POOL_ADDRESS =
        0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9;
}

contract CurveAlUsdAllocation is
    MetaPoolAllocationBase,
    ImmutableAssetAllocation,
    CurveAlUsdConstants
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
        tokens[0] = TokenData(PRIMARY_UNDERLYER_ADDRESS, "alUSD", 18);
        tokens[1] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[2] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[3] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
