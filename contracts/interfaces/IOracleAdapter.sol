// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

interface IOracleAdapter {
    struct Value {
        uint256 value;
        uint256 periodEnd;
    }

    function setTvl(uint256 value, uint256 period) external;

    function setAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external;

    function getAssetPrice(address asset) external view returns (uint256 price);

    function getTvl() external view returns (uint256 tvl);

    function isUnlocked() external view returns (bool);

    function setLock(uint256 period) external view returns (bool);
}
