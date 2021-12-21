// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IStableSwap2 as IStableSwap
} from "contracts/protocols/curve/common/interfaces/Imports.sol";
import {ConvexZapBase} from "../common/Imports.sol";
import {ConvexSaaveConstants} from "./Constants.sol";

contract ConvexSaaveZap is ConvexZapBase, ConvexSaaveConstants {
    string internal constant AAVE_ALLOCATION = "aave";

    constructor()
        public
        ConvexZapBase(STABLE_SWAP_ADDRESS, LP_TOKEN_ADDRESS, PID, 10000, 100, 2)
    {} // solhint-disable no-empty-blocks

    function assetAllocations() public view override returns (string[] memory) {
        string[] memory allocationNames = new string[](3);
        allocationNames[0] = "curve-saave";
        allocationNames[1] = NAME;
        allocationNames[2] = AAVE_ALLOCATION;
        return allocationNames;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = _createErc20AllocationArray(1);
        allocations[4] = IERC20(SUSD_ADDRESS);
        return allocations;
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        IStableSwap(SWAP_ADDRESS).add_liquidity(
            [amounts[0], amounts[1]],
            minAmount,
            true
        );
    }

    function _removeLiquidity(
        uint256 lpBalance,
        uint8 index,
        uint256 minAmount
    ) internal override {
        require(index < 2, "INVALID_INDEX");
        IStableSwap(SWAP_ADDRESS).remove_liquidity_one_coin(
            lpBalance,
            index,
            minAmount,
            true
        );
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        return IStableSwap(SWAP_ADDRESS).get_virtual_price();
    }

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        return IStableSwap(SWAP_ADDRESS).underlying_coins(i);
    }
}
