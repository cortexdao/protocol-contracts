// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {LpAccountV2} from "./LpAccountV2.sol";
import {TestLpAccountStorage} from "./TestLpAccountStorage.sol";

contract TestLpAccountV2 is TestLpAccountStorage, LpAccountV2 {
    function testLockOracleAdapter(uint256 lockPeriod) external {
        _lockOracleAdapter(lockPeriod);
    }

    function testSendFeesToTreasurySafe(uint256[] memory rewardsFees) external {
        _sendFeesToTreasurySafe(rewardsFees);
    }

    function setTestRewardTokens(address[] memory tokens) external {
        _testRewardTokens = tokens;
    }

    function setTestMinter(address minter) external {
        _testMinter = minter;
    }

    function testGetRewardsBalances()
        external
        view
        returns (uint256[] memory balances)
    {
        return _getRewardsBalances();
    }

    function testCalculateRewardsFees(
        uint256[] memory preClaimRewardsBalances,
        uint256[] memory postClaimRewardsBalances
    ) external view returns (uint256[] memory) {
        return
            _calculateRewardsFees(
                preClaimRewardsBalances,
                postClaimRewardsBalances
            );
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
