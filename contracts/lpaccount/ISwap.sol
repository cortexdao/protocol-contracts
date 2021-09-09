// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    IAssetAllocation,
    INameIdentifier,
    IERC20
} from "contracts/common/Imports.sol";

interface ISwap is INameIdentifier {
    function swap(uint256 amount) external;

    // Asset allocation contracts required for the strategy
    function assetAllocations()
        external
        view
        returns (IAssetAllocation[] memory);

    // ERC20 asset allocation tokens required for the strategy
    function erc20Allocations() external view returns (IERC20[] memory);
}
