// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveUstConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-ust";

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
