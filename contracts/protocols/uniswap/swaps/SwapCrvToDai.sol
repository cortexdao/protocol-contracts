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

    IERC20 private constant _DAI =
        IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);

    event Swap(ISwapRouter.ExactInputParams params, uint256 amountOut);

    // solhint-disable-next-line no-empty-blocks
    constructor() public BaseSwapCrvToStablecoin(_DAI) {}
}
