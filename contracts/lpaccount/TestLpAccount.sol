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
        uint256 length = _deploysArray.length;
        uint256[][] memory calls = new uint256[][](length);
        for (uint256 i = 0; i < length; i++) {
            calls[i] = _deploysArray[i];
        }
        return calls;
    }

    function _unwindCalls() external view returns (uint256[] memory) {
        uint256 length = _unwindsArray.length;
        uint256[] memory calls = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            calls[i] = _unwindsArray[i];
        }
        return calls;
    }

    function _swapCalls() external view returns (uint256[] memory) {
        uint256 length = _swapsArray.length;
        uint256[] memory calls = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            calls[i] = _swapsArray[i];
        }
        return calls;
    }
}
