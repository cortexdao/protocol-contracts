// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveAaveConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-aave";

    address public constant STABLE_SWAP_ADDRESS =
        0xDeBF20617708857ebe4F679508E7b7863a8A8EeE;
    address public constant LP_TOKEN_ADDRESS =
        0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0xd662908ADA2Ea1916B3318327A97eB18aD588b5d;
}
