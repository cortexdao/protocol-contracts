// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {LpAccountV2} from "./LpAccountV2.sol";
import {TestLpAccountStorage} from "./TestLpAccountStorage.sol";

contract TestLpAccountV2 is TestLpAccountStorage, LpAccountV2 {
    function testLockOracleAdapter(uint256 lockPeriod) external {
        _lockOracleAdapter(lockPeriod);
    }

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
