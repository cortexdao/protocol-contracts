// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {
    IStableSwap
} from "contracts/protocols/curve/common/interfaces/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract MetapoolConstants is Curve3PoolUnderlyerConstants {
    IStableSwap public constant BASE_POOL =
        IStableSwap(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7);
}
