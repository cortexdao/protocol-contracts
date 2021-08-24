// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "./IAssetAllocation.sol";
import {INameIdentifier} from "./INameIdentifier.sol";

interface IZap is INameIdentifier {
    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external;

    // LP token amount
    function unwindLiquidity(uint256 amount) external;

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
