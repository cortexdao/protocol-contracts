// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    IAssetAllocation,
    IERC20,
    INameIdentifier
} from "contracts/common/Imports.sol";
import {IZap} from "./IZap.sol";
import {TestLpAccountStorage} from "./TestLpAccountStorage.sol";

contract TestRewardZap is IZap, TestLpAccountStorage {
    constructor(string memory name) public {
        _name = name;
    }

    function deployLiquidity(uint256[] calldata) external override {
        revert("NOT_IMPLEMENTED");
    }

    // TODO: push index in addition to amount
    function unwindLiquidity(uint256, uint8) external override {
        revert("NOT_IMPLEMENTED");
    }

    function claim() external override {
        revert("NOT_IMPLEMENTED");
    }

    // solhint-disable-next-line func-name-mixedcase
    function NAME() external view override returns (string memory) {
        return _name;
    }

    // Order of token amounts
    function sortedSymbols() external view override returns (string[] memory) {
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

    function assetAllocations()
        external
        view
        override
        returns (string[] memory)
    {
        return _assetAllocations;
    }

    function erc20Allocations()
        external
        view
        override
        returns (IERC20[] memory)
    {
        return _tokens;
    }

    function _setAssetAllocations(string[] memory allocationNames) public {
        _assetAllocations = allocationNames;
    }

    function _setErc20Allocations(IERC20[] memory tokens) public {
        _tokens = tokens;
    }
}
