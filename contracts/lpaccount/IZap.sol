// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    IAssetAllocation,
    INameIdentifier,
    IERC20
} from "contracts/common/Imports.sol";

interface IZap is INameIdentifier {
    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external;

    /**
     * @param amount LP token amount
     * @param index underlyer index
     */
    function unwindLiquidity(uint256 amount, uint8 index) external;

    function claim() external;

    // Order of token amounts
    function sortedSymbols() external view returns (string[] memory);

    // Asset allocation contracts required for the strategy
    function assetAllocations()
        external
        view
        returns (IAssetAllocation[] memory);

    // ERC20 asset allocation tokens required for the strategy
    function erc20Allocations() external view returns (IERC20[] memory);
}
