// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYMetaPoolToken.sol";

contract APYMetaPoolTokenUpgraded is APYMetaPoolToken {
    bool public newlyAddedVariable;

    function initializeUpgrade() public override onlyAdmin {
        newlyAddedVariable = true;
    }
}
