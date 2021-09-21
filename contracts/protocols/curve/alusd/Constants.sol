// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

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
    address public constant ALCX_ADDRESS =
        0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF;
}
