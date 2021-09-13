// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

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
