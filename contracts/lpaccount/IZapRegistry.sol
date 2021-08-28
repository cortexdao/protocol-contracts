// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IZap} from "./IZap.sol";

interface IZapRegistry {
    event ZapRegistered(IZap zap);
    event ZapRemoved(string name);

    // ID should be human readable
    function registerZap(IZap zap) external;

    function removeZap(string calldata name) external;

    function names() external view returns (string[] memory);
}
