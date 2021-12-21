// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IERC20, INameIdentifier} from "contracts/common/Imports.sol";
import {
    IBaseRewardPool
} from "contracts/protocols/convex/common/interfaces/Imports.sol";
import {
    IMetaPool,
    IOldDepositor
} from "contracts/protocols/curve/metapool/Imports.sol";

abstract contract ConvexUsdtConstants is INameIdentifier {
    string public constant override NAME = "convex-usdt";

    uint256 public constant PID = 1;

    address public constant STABLE_SWAP_ADDRESS =
        0x52EA46506B9CC5Ef470C5bf89f17Dc28bB35D85C;
    address public constant DEPOSIT_ZAP_ADDRESS =
        0xac795D2c97e60DF6a99ff1c814727302fD747a80;
    address public constant LP_TOKEN_ADDRESS =
        0x9fC689CCaDa600B6DF723D9E47D84d76664a1F23;
    address public constant REWARD_CONTRACT_ADDRESS =
        0x8B55351ea358e5Eda371575B031ee24F462d503e;
}
