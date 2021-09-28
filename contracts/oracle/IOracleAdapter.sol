// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface IOracleAdapter {
    struct Value {
        uint256 value;
        uint256 periodEnd;
    }

    /// @notice Event fired when asset's pricing source (aggregator) is updated
    event AssetSourceUpdated(address indexed asset, address indexed source);

    /// @notice Event fired when the TVL aggregator address is updated
    event TvlSourceUpdated(address indexed source);

    /// @notice Set the TVL aggregator address.
    function emergencySetTvlSource(address source) external;

    /// @notice Set the asset's pricing source.
    function emergencySetAssetSource(address asset, address source) external;

    /**
     * @notice Set multiple assets' pricing sources.
     * @param assets asset addresses
     * @param sources pricing source addresses
     */
    function emergencySetAssetSources(
        address[] memory assets,
        address[] memory sources
    ) external;

    /// @notice Retrieve the asset's price from its pricing source.
    function getAssetPrice(address asset) external view returns (uint256);

    /// @notice Retrieve the deployed TVL from the TVL aggregator.
    function getTvl() external view returns (uint256);
}
