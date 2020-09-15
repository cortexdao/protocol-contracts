// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "./APYLiquidityPoolImplementation.sol";

contract APYLiquidityPoolImplementationUpgraded is
    APYLiquidityPoolImplementation
{
    bool public newlyAddedVariable;

    function initializeUpgrade() public override onlyAdmin {
        newlyAddedVariable = true;
    }
}
