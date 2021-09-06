// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {LpAccount} from "./LpAccount.sol";
import {TestZapStorage} from "./TestZap.sol";
import {TestSwapStorage} from "./TestSwap.sol";

contract TestLpAccount is TestZapStorage, TestSwapStorage, LpAccount {
    /**
     * Testing functions
     */

    function _deployCalls() external view returns (uint256[][] memory) {
        return _deploysArray;
    }

    function _unwindCalls() external view returns (uint256[] memory) {
        return _unwindsArray;
    }

    function _swapCalls() external view returns (uint256[] memory) {
        return _swapsArray;
    }
}
