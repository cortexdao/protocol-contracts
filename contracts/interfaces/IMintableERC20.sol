// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20UpgradeSafe} from "./IDetailedERC20UpgradeSafe.sol";
import {IMintable} from "./IMintable.sol";

// solhint-disable no-empty-blocks
interface IMintableERC20 is IDetailedERC20UpgradeSafe, IMintable {

}
