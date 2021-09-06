// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IAssetAllocation, IERC20} from "contracts/common/Imports.sol";

abstract contract TestLpAccountStorage {
    string internal _name;

    IAssetAllocation[] internal _assetAllocations;
    IERC20[] internal _tokens;
}
