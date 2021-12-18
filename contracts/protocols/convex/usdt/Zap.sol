// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {
    IOldStableSwap3 as IStableSwap,
    IDepositZap3 as IDepositZap
} from "contracts/protocols/curve/common/interfaces/Imports.sol";
import {ConvexZapBase} from "contracts/protocols/convex/common/Imports.sol";
import {ConvexUsdtConstants} from "./Constants.sol";

contract ConvexUsdtZap is ConvexZapBase, ConvexUsdtConstants {
    constructor()
        public
        ConvexZapBase(DEPOSIT_ZAP_ADDRESS, LP_TOKEN_ADDRESS, PID, 10000, 100, 3)
    {} // solhint-disable no-empty-blocks

    function assetAllocations() public view override returns (string[] memory) {
        string[] memory allocationNames = new string[](2);
        allocationNames[0] = "curve-usdt";
        allocationNames[1] = NAME;
        return allocationNames;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = _createErc20AllocationArray(1);
        allocations[4] = IERC20(CVX_ADDRESS);
        return allocations;
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        IDepositZap(SWAP_ADDRESS).add_liquidity(
            [amounts[0], amounts[1], amounts[2]],
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

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        return IDepositZap(SWAP_ADDRESS).underlying_coins(int128(i));
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        address stableSwap = IDepositZap(SWAP_ADDRESS).curve();
        return IStableSwap(stableSwap).get_virtual_price();
    }
}
