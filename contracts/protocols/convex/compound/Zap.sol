// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ConvexZapBase} from "../common/Imports.sol";
import {ConvexCompoundConstants} from "./Constants.sol";

import {SafeERC20, SafeMath} from "contracts/libraries/Imports.sol";
import {
    IOldStableSwap2 as IStableSwap,
    IDepositZap
} from "contracts/protocols/curve/common/interfaces/Imports.sol";

contract ConvexCompoundZap is ConvexZapBase, ConvexCompoundConstants {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    constructor()
        public
        ConvexZapBase(DEPOSIT_ZAP_ADDRESS, LP_TOKEN_ADDRESS, PID, 10000, 100, 2)
    {} // solhint-disable no-empty-blocks

    function assetAllocations() public view override returns (string[] memory) {
        string[] memory allocationNames = new string[](2);
        allocationNames[0] = "curve-compound";
        allocationNames[1] = NAME;
        return allocationNames;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        return _createErc20AllocationArray(0);
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        IDepositZap(SWAP_ADDRESS).add_liquidity(
            [amounts[0], amounts[1]],
            minAmount
        );
    }

    function _removeLiquidity(
        uint256 lpBalance,
        uint8 index,
        uint256 minAmount
    ) internal override {
        IERC20(LP_TOKEN_ADDRESS).safeApprove(SWAP_ADDRESS, 0);
        IERC20(LP_TOKEN_ADDRESS).safeApprove(SWAP_ADDRESS, lpBalance);
        IDepositZap(SWAP_ADDRESS).remove_liquidity_one_coin(
            lpBalance,
            index,
            minAmount
        );
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        address stableSwap = IDepositZap(SWAP_ADDRESS).curve();
        return IStableSwap(stableSwap).get_virtual_price();
    }

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        return IDepositZap(SWAP_ADDRESS).underlying_coins(int128(i));
    }
}
