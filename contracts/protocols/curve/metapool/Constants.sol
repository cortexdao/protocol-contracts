// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {
    IStableSwap
} from "contracts/protocols/curve/common/interfaces/Imports.sol";

abstract contract MetapoolConstants {
    IStableSwap public constant BASE_POOL =
        IStableSwap(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7);
}
