// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IOracleAdapter.sol";

contract OracleAdapter is Ownable, IOracleAdapter {
    using SafeMath for uint256;

    /// @notice seconds within which aggregator should be updated
    uint256 public aggStalePeriod;
    mapping(address => AggregatorV3Interface) public assetSources;
    AggregatorV3Interface public tvlSource;

    event AssetSourceUpdated(address indexed asset, address indexed source);
    event TvlSourceUpdated(address indexed source);
    event AggStalePeriodUpdated(uint256 aggStalePeriod_);

    /**
     * @notice Constructor
     * @param assets the assets priced by sources
     * @param sources the source for each asset
     * @param tvlSource the source for the TVL value
     * @param aggStalePeriod_ the number of seconds until a source value is stale
     */
    constructor(
        address[] memory assets,
        address[] memory sources,
        address tvlSource,
        uint256 aggStalePeriod_
    ) public {
        _setAssetSources(assets, sources);
        _setTvlSource(tvlSource);
        _setAggStalePeriod(aggStalePeriod_);
    }

    /**
     * @notice Set or replace asset price sources
     * @param assets the array of assets token addresses
     * @param sources the array of price sources (aggregators)
     */
    function setAssetSources(
        address[] calldata assets,
        address[] calldata sources
    ) external onlyOwner {
        _setAssetSources(assets, sources);
    }

    /**
     * @notice Set or replace the TVL source
     * @param source the TVL source address
     */
    function setTvlSource(address source) external onlyOwner {
        _setTvlSource(source);
    }

    /**
     * @notice Set the length of time before an agg value is considered stale
     * @param aggStalePeriod_ the length of time in seconds
     */
    function setAggStalePeriod(uint256 aggStalePeriod_) external onlyOwner {
        _setAggStalePeriod(aggStalePeriod_);
    }

    /**
     * @notice Gets an asset price by address
     * @param asset the asset address
     * @return the asset price
     */
    function getAssetPrice(address asset)
        public
        view
        override
        returns (uint256)
    {
        AggregatorV3Interface source = assetSources[asset];
        uint256 price = _getPriceFromSource(source);

        // Unlike TVL, a price should never be 0
        require(price > 0, "MISSING_ASSET_VALUE");
        return price;
    }

    /**
     * @notice Get the TVL value
     * @return the TVL
     */
    function getTVL() public view override returns (uint256) {
        return _getPriceFromSource(tvlSource);
    }

    /**
     * @notice Set or replace asset price sources
     * @param assets the array of assets token addresses
     * @param sources the array of price sources (aggregators)
     */
    function _setAssetSources(address[] memory assets, address[] memory sources)
        private
    {
        require(assets.length == sources.length, "INCONSISTENT_PARAMS_LENGTH");
        for (uint256 i = 0; i < assets.length; i++) {
            assetSources[assets[i]] = AggregatorV3Interface(sources[i]);
            emit AssetSourceUpdated(assets[i], sources[i]);
        }
    }

    /**
     * @notice Set the source for TVL value
     * @param source the TVL source (aggregator)
     */
    function _setTvlSource(address source) private {
        require(source != address(0), "INVALID_SOURCE");
        tvlSource = AggregatorV3Interface(source);
        emit TvlSourceUpdated(source);
    }

    /**
     * @notice Set the length of time before an agg value is considered stale
     * @param aggStalePeriod_ the length of time in seconds
     */
    function _setAggStalePeriod(uint256 aggStalePeriod_) private {
        require(aggStalePeriod_ > 0, "INVALID_STALE_PERIOD");
        aggStalePeriod = aggStalePeriod_;
        emit AggStalePeriodUpdated(aggStalePeriod_);
    }

    /**
     * @notice Get the price from a source (aggregator)
     * @dev Prices and TVL values should always be positive
     * @return the price from the source
     */
    function _getPriceFromSource(AggregatorV3Interface source)
        internal
        view
        returns (uint256)
    {
        require(address(source) != address(0), "INVALID_SOURCE");
        (, int256 price, , uint256 updatedAt, ) = source.latestRoundData();

        require(price >= 0, "MISSING_ASSET_VALUE");

        // solhint-disable not-rely-on-time
        require(
            block.timestamp.sub(updatedAt) <= aggStalePeriod,
            "CHAINLINK_STALE_DATA"
        );
        // solhint-enable not-rely-on-time

        return uint256(price);
    }
}
