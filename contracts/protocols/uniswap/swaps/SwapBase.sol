// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeERC20} from "contracts/libraries/Imports.sol";
import {IERC20, IAssetAllocation} from "contracts/common/Imports.sol";
import {ISwapRouter} from "./ISwapRouter.sol";
import {ISwap} from "contracts/lpaccount/Imports.sol";

abstract contract SwapBase is ISwap {
    using SafeERC20 for IERC20;

    ISwapRouter private constant _ROUTER =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    IERC20 internal immutable _IN_TOKEN;
    IERC20 internal immutable _OUT_TOKEN;

    event Swap(ISwapRouter.ExactInputParams params, uint256 amountOut);

    constructor(IERC20 inToken, IERC20 outToken) public {
        _IN_TOKEN = inToken;
        _OUT_TOKEN = outToken;
    }

    // TODO: create function for calculating min amount
    function swap(uint256 amount) external override {
        _IN_TOKEN.safeApprove(address(_ROUTER), 0);
        _IN_TOKEN.safeApprove(address(_ROUTER), amount);

        ISwapRouter.ExactInputParams memory params =
            _getExactInputParams(amount);
        uint256 amountOut = _ROUTER.exactInput(params);

        emit Swap(params, amountOut);
    }

    function erc20Allocations()
        external
        view
        override
        returns (IERC20[] memory)
    {
        IERC20[] memory allocations = new IERC20[](2);
        allocations[0] = _IN_TOKEN;
        allocations[1] = _OUT_TOKEN;
        return allocations;
    }

    function _getExactInputParams(uint256 amount)
        internal
        view
        virtual
        returns (ISwapRouter.ExactInputParams memory params);
}
