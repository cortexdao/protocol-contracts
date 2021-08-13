// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {ILpSafeFunder} from "./ILpSafeFunder.sol";

interface IMintable {
    function mint(ILpSafeFunder.PoolAmount[] calldata depositAmounts) external;

    function burn(ILpSafeFunder.PoolAmount[] calldata withdrawAmounts) external;
}
