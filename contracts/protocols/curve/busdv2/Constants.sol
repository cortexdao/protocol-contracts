// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveBusdV2Constants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-busdv2";

    address public constant META_POOL_ADDRESS =
        0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xd4B22fEdcA85E684919955061fDf353b9d38389b;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x4Fabb145d64652a948d72533023f6E7A623C7C53;
}
