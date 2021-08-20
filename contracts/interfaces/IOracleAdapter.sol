// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface IOracleAdapter {
    event DefaultLocked(address locker, uint256 defaultPeriod, uint256 lockEnd);
    event Locked(address locker, uint256 activePeriod, uint256 lockEnd);

    function lock() external;

    function defaultLockPeriod() external returns (uint256 period);

    function lockFor(uint256 period) external;

    function getAssetPrice(address asset) external view returns (uint256);

    function getTvl() external view returns (uint256);

    function isLocked() external view returns (bool);
}
