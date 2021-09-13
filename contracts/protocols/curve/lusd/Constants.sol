// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveLusdConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-lusd";

    address public constant META_POOL_ADDRESS =
        0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x9B8519A9a00100720CCdC8a120fBeD319cA47a14;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x5f98805A4E8be255a32880FDeC7F6728C6568bA0;
}
