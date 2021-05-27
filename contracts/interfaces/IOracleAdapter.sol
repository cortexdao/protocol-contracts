// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

interface IOracleAdapter {
    function getAssetPrice(address asset) external view returns (uint256);

    function getTvl() external view returns (uint256);
}
