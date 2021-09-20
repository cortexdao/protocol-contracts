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

contract TestZap is IZap, TestLpAccountStorage {
    string[] internal _sortedSymbols;

    constructor(string memory name) public {
        _name = name;
    }

    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        _deploysArray.push(amounts);
    }

    // LP token amount
    // TODO: push index in addition to amount
    function unwindLiquidity(uint256 amount, uint8) external override {
        _unwindsArray.push(amount);
    }

    function claim() external override {
        _claimsCounter += 1;
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
        returns (string[] memory)
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

    function _setAssetAllocations(string[] memory allocationNames) public {
        _assetAllocations = allocationNames;
    }

    function _setErc20Allocations(IERC20[] memory tokens) public {
        _tokens = tokens;
    }
}
