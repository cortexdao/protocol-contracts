// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveIronBankConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-ironbank";

    address public constant STABLE_SWAP_ADDRESS =
        0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF;
    address public constant LP_TOKEN_ADDRESS =
        0x5282a4eF67D9C33135340fB3289cc1711c13638C;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xF5194c3325202F456c95c1Cf0cA36f8475C1949F;
}
