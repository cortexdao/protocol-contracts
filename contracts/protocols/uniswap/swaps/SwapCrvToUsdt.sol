// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeERC20} from "contracts/libraries/Imports.sol";
import {IERC20, IAssetAllocation} from "contracts/common/Imports.sol";
import {ISwapRouter} from "./ISwapRouter.sol";
import {SwapCrvToStablecoinBase} from "./SwapCrvToStablecoinBase.sol";

contract SwapCrvToUsdt is SwapCrvToStablecoinBase {
    using SafeERC20 for IERC20;

    string public constant override NAME = "crv-to-usdt";

    IERC20 private constant _USDT =
        IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    // solhint-disable-next-line no-empty-blocks
    constructor() public SwapCrvToStablecoinBase(_USDT) {}
}
