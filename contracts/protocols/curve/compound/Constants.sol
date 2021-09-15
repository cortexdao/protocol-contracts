// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveCompoundConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-compound";

    address public constant STABLE_SWAP_ADDRESS =
        0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56;
    address public constant LP_TOKEN_ADDRESS =
        0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x7ca5b0a2910B33e9759DC7dDB0413949071D7575;
}
