// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveUsdpConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-usdp";

    address public constant META_POOL_ADDRESS =
        0x42d7025938bEc20B69cBae5A77421082407f053A;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x055be5DDB7A925BfEF3417FC157f53CA77cA7222;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x1456688345527bE1f37E9e627DA0837D6f08C925;
}
