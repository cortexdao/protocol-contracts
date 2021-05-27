// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

interface IOracleAdapter {
    function submitTVLValue(uint256 newValue, uint256 expiry) external;

    function submittedTVLValue(uint256 value) external;

    function getAssetPrice(address asset) external view returns (uint256);

    function getTvl() external view returns (uint256);

    function isLocked() external view returns (bool);
}
