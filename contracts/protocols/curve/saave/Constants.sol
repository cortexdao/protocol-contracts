// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveSaaveConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-saave";

    address public constant STABLE_SWAP_ADDRESS =
        0xEB16Ae0052ed37f479f7fe63849198Df1765a733;
    address public constant LP_TOKEN_ADDRESS =
        0x02d341CcB60fAaf662bC0554d13778015d1b285C;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x462253b8F74B72304c145DB0e4Eebd326B22ca39;
}
