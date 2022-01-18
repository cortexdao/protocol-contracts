// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";

abstract contract ConvexCompoundConstants is INameIdentifier {
    string public constant override NAME = "convex-compound";

    uint256 public constant PID = 0;

    address public constant STABLE_SWAP_ADDRESS =
        0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56;
    address public constant DEPOSIT_ZAP_ADDRESS =
        0xeB21209ae4C2c9FF2a86ACA31E123764A3B6Bc06;
    address public constant LP_TOKEN_ADDRESS =
        0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2;
    address public constant REWARD_CONTRACT_ADDRESS =
        0xf34DFF761145FF0B05e917811d488B441F33a968;
}
