// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "contracts/common/Imports.sol";
import {ISwapRouter} from "./ISwapRouter.sol";
import {SwapBase} from "./SwapBase.sol";

abstract contract AaveToStablecoinSwapBase is SwapBase {
    IERC20 private constant _AAVE =
        IERC20(0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9);

    IERC20 private constant _WETH =
        IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    uint24 private _AAVE_WETH_FEE = 10000;
    uint24 private _WETH_STABLECOIN_FEE = 500;

    constructor(IERC20 stablecoin) public SwapBase(_AAVE, stablecoin) {} // solhint-disable-line no-empty-blocks

    function _getExactInputParams(uint256 amount)
        internal
        view
        virtual
        override
        returns (ISwapRouter.ExactInputParams memory params)
    {
        // solhint-disable not-rely-on-time
        params = ISwapRouter.ExactInputParams({
            path: abi.encodePacked(
                address(_IN_TOKEN),
                _AAVE_WETH_FEE,
                address(_WETH),
                _WETH_STABLECOIN_FEE,
                address(_OUT_TOKEN)
            ),
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amount,
            amountOutMinimum: 0
        });
        // solhint-enable not-rely-on-time
    }
}
