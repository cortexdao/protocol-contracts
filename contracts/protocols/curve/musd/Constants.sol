// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveMusdConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-musd";

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
