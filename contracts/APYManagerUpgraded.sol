// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "./APYManager.sol";

contract APYManagerUpgraded is APYManager {
    bool public newlyAddedVariable;

    function initializeUpgrade() public override onlyAdmin {
        newlyAddedVariable = true;
    }
}
