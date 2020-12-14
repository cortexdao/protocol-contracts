// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "../APYAddressRegistry.sol";

contract APYAddressRegistryUpgraded is APYAddressRegistry {
    bool public newlyAddedVariable;

    function initializeUpgrade() public override onlyAdmin {
        newlyAddedVariable = true;
    }
}
