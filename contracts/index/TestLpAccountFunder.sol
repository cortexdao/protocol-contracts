// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {LpAccountFunder, ILockingOracle} from "./LpAccountFunder.sol";

contract TestLpAccountFunder is LpAccountFunder {
    constructor(address addressRegistry_, address indexToken_)
        public
        LpAccountFunder(addressRegistry_, indexToken_)
    {} // solhint-disable-line no-empty-blocks

    function testFundLpAccount(uint256 amount) external {
        _fundLpAccount(amount);
    }

    function testWithdrawFromLpAccount(uint256 amount) external {
        _withdrawFromLpAccount(amount);
    }

    function testRegisterPoolUnderlyer() external {
        _registerPoolUnderlyer();
    }

    function testGetOracleAdapter() external view returns (ILockingOracle) {
        return _getOracleAdapter();
    }

    function testGetFundAmount(int256 amount) external pure returns (uint256) {
        return _getFundAmount(amount);
    }

    function testCalculateAmountToWithdraw(
        int256 topupAmount,
        uint256 lpAccountBalance
    ) external pure returns (uint256) {
        return _calculateAmountToWithdraw(topupAmount, lpAccountBalance);
    }
}
