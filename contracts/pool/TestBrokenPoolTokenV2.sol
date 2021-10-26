// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {PoolTokenV2} from "./PoolTokenV2.sol";

/** @dev dummy contract using storage slots */
contract ExtraStorage {
    uint256[150] private _gap;
    // slot 151 must be `true` to allow `initializeUpgrade`
    // to be called after upgrade, as it is protected
    // by a re-entrancy guard.
    bool private _notEntered = true;
}

/**
 * @dev Test contract to bork upgrade. Using `ExtraStorage` at the
 * base level means the PoolTokenV2 storage slots are shifted.
 *
 * Should not be used other than in test files!
 */
// solhint-disable-next-line no-empty-blocks
contract TestBrokenPoolTokenV2 is ExtraStorage, PoolTokenV2 {

}
