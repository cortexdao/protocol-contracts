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

abstract contract ConvexLusdConstants is INameIdentifier {
    string public constant override NAME = "convex-lusd";

    uint256 public constant PID = 33;

    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    IERC20 public constant LP_TOKEN =
        IERC20(0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA);

    // metapool primary underlyer
    IERC20 public constant PRIMARY_UNDERLYER =
        IERC20(0x5f98805A4E8be255a32880FDeC7F6728C6568bA0);

    IMetaPool public constant META_POOL =
        IMetaPool(0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA);

    IBaseRewardPool public constant REWARD_CONTRACT =
        IBaseRewardPool(0x2ad92A7aE036a038ff02B96c88de868ddf3f8190);
}
