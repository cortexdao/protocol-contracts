// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";

abstract contract ConvexSaaveConstants is INameIdentifier {
    string public constant override NAME = "convex-saave";

    uint256 public constant PID = 26;

    address public constant STABLE_SWAP_ADDRESS =
        0xEB16Ae0052ed37f479f7fe63849198Df1765a733;
    address public constant LP_TOKEN_ADDRESS =
        0x02d341CcB60fAaf662bC0554d13778015d1b285C;
    address public constant REWARD_CONTRACT_ADDRESS =
        0xF86AE6790654b70727dbE58BF1a863B270317fD0;

    address public constant SUSD_ADDRESS =
        0x57Ab1ec28D129707052df4dF418D58a2D46d5f51;
}
