// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IZap} from "./IZap.sol";

interface IZapRegistry {
    // ID should be human readable
    function registerZap(IZap zap) external;

    function removeZap(string calldata name) external;

    function names() external view returns (string[] calldata);
}
