// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface IOracleAdapter {
    struct Value {
        uint256 value;
        uint256 periodEnd;
    }

    function setTvl(uint256 value, uint256 period) external;

    function unsetTvl() external;

    function setAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external;

    function unsetAssetValue(address asset) external;

    function lock() external;

    function defaultLockPeriod() external returns (uint256 period);

    function setDefaultLockPeriod(uint256 period) external;

    function lockFor(uint256 period) external;

    function unlock() external;

    function getAssetPrice(address asset) external view returns (uint256);

    function getTvl() external view returns (uint256);

    function isLocked() external view returns (bool);
}
