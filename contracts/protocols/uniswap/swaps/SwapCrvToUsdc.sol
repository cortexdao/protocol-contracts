// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeERC20} from "contracts/libraries/Imports.sol";
import {IERC20, IAssetAllocation} from "contracts/common/Imports.sol";
import {ISwapRouter} from "./ISwapRouter.sol";
import {BaseSwapCrvToStablecoin} from "./BaseSwapCrvToStablecoin.sol";

contract SwapCrvToUsdc is BaseSwapCrvToStablecoin {
    using SafeERC20 for IERC20;

    string public constant override NAME = "crv-to-usdc";

    IERC20 private constant _USDC =
        IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    // solhint-disable-next-line no-empty-blocks
    constructor() public BaseSwapCrvToStablecoin(_USDC) {}
}
