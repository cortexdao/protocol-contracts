// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IOracleAdapter} from "./IOracleAdapter.sol";

interface ILockingOracle is IOracleAdapter {
    event DefaultLocked(address locker, uint256 defaultPeriod, uint256 lockEnd);
    event Locked(address locker, uint256 activePeriod, uint256 lockEnd);

    event DefaultLockPeriodChanged(uint256 newPeriod);
    event Unlocked();

    event ChainlinkStalePeriodUpdated(uint256 period);

    function lock() external;

    function lockFor(uint256 period) external;

    function emergencyUnlock() external;

    function setDefaultLockPeriod(uint256 newPeriod) external;

    function setChainlinkStalePeriod(uint256 chainlinkStalePeriod_) external;

    function defaultLockPeriod() external returns (uint256 period);

    function isLocked() external view returns (bool);
}
