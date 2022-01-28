// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IZap} from "contracts/lpaccount/Imports.sol";

contract CvxMimToCvx3poolMigration is IZap {
    string public constant override NAME = "cvx-mim-to-cvx3pool";

    function deployLiquidity(uint256[] calldata) external override {
        revert("NOT_IMPLEMENTED");
    }

    /**
     * @param amount LP token amount
     * @param index unused
     */
    function unwindLiquidity(uint256 amount, uint8 index) external override {}

    function claim() external override {
        revert("NOT_IMPLEMENTED");
    }

    function getLpTokenBalance(address)
        external
        view
        override
        returns (uint256)
    {
        revert("NOT_IMPLEMENTED");
    }

    function sortedSymbols() external view override returns (string[] memory) {
        revert("NOT_IMPLEMENTED");
    }

    function assetAllocations() public view override returns (string[] memory) {
        return new string[](0);
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        return new IERC20[](0);
    }
}
