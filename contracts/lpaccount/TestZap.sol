// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    IAssetAllocation,
    IERC20,
    INameIdentifier
} from "contracts/common/Imports.sol";
import {IZap} from "./IZap.sol";

contract TestZapStorage {
    string internal _name;

    IAssetAllocation[] internal _assetAllocations;
    IERC20[] internal _tokens;
    string[] internal _sortedSymbols;

    uint256[][] internal _deploysArray;
    uint256[] internal _unwindsArray;
}

contract TestZap is IZap, TestZapStorage {
    constructor(string memory name) public {
        _name = name;
    }

    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        _deploysArray.push(amounts);
    }

    // LP token amount
    function unwindLiquidity(uint256 amount) external override {
        _unwindsArray.push(amount);
    }

    // solhint-disable-next-line func-name-mixedcase
    function NAME() external view override returns (string memory) {
        return _name;
    }

    // Order of token amounts
    function sortedSymbols() external view override returns (string[] memory) {
        return _sortedSymbols;
    }

    // Asset allocation contracts required for the strategy
    function assetAllocations()
        external
        view
        override
        returns (IAssetAllocation[] memory)
    {
        return _assetAllocations;
    }

    // ERC20 asset allocation tokens required for the strategy
    function erc20Allocations()
        external
        view
        override
        returns (IERC20[] memory)
    {
        return _tokens;
    }

    /**
     * Testing functions
     */

    function _setAssetAllocations(IAssetAllocation[] memory allocations)
        public
    {
        _assetAllocations = allocations;
    }

    function _setErc20Allocations(IERC20[] memory tokens) public {
        _tokens = tokens;
    }
}
