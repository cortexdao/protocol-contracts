// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {ISwap} from "./ISwap.sol";

interface ISwapRegistry {
    event SwapRegistered(ISwap swap);
    event SwapRemoved(string name);

    // ID should be human readable
    function registerSwap(ISwap swap) external;

    function removeSwap(string calldata name) external;

    function swapNames() external view returns (string[] memory);
}
