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

contract CurveFraxConstants is Curve3PoolUnderlyerConstants {
    address public constant META_POOL_ADDRESS =
        0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x72E158d38dbd50A483501c24f792bDAAA3e7D55C;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x853d955aCEf822Db058eb8505911ED77F175b99e;
}

contract CurveFraxAllocation is
    MetaPoolAllocationBase,
    ImmutableAssetAllocation,
    CurveFraxConstants
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
        tokens[0] = TokenData(PRIMARY_UNDERLYER_ADDRESS, "FRAX", 18);
        tokens[1] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[2] = TokenData(USDC_ADDRESS, "USDC", 6);
        tokens[3] = TokenData(USDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
