// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {MetaPoolToken} from "./MetaPoolToken.sol";

contract MetaPoolTokenUpgraded is MetaPoolToken {
    bool public newlyAddedVariable;

    function initializeUpgrade() public override {
        require(msg.sender == proxyAdmin(), "PROXY_ADMIN_ONLY");
        newlyAddedVariable = true;
    }
}
