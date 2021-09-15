// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface IOracleAdapter {
    struct Value {
        uint256 value;
        uint256 periodEnd;
    }

    event AssetSourceUpdated(address indexed asset, address indexed source);
    event TvlSourceUpdated(address indexed source);

    function emergencySetTvlSource(address source) external;

    function emergencySetAssetSource(address asset, address source) external;

    function emergencySetAssetSources(
        address[] memory assets,
        address[] memory sources
    ) external;

    function getAssetPrice(address asset) external view returns (uint256);

    function getTvl() external view returns (uint256);
}
