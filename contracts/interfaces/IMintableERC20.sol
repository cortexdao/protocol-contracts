// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IDetailedERC20} from "./IDetailedERC20.sol";
import {IMintable} from "./IMintable.sol";

// solhint-disable no-empty-blocks
interface IMintableERC20 is IDetailedERC20, IMintable {

}
