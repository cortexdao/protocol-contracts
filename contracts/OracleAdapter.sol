// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IOracleAdapter.sol";

contract OracleAdapter is Ownable, IOracleAdapter {
    using SafeMath for uint256;
    using Address for address;

    /// @notice seconds within which source should update
    uint256 private _chainlinkStalePeriod;
    uint256 private _lockEnd;
    AggregatorV3Interface private _tvlSource;
    mapping(address => AggregatorV3Interface) private _assetSources;
    mapping(address => Value) private _submittedAssetValues;
    Value private _submittedTvlValue;

    event AssetSourceUpdated(address indexed asset, address indexed source);
    event TvlSourceUpdated(address indexed source);
    event StalePeriodUpdated(uint256 stalePeriod);

    modifier unlocked() {
        require(isUnlocked(), "ORACLE_LOCKED");
        _;
    }

    modifier locked() {
        require(!isUnlocked(), "ORACLE_UNLOCKED");
        _;
    }

    /**
     * @notice Constructor
     * @param assets the assets priced by sources
     * @param sources the source for each asset
     * @param tvlSource the source for the TVL value
     * @param stalePeriod the number of seconds until a source value is stale
     */
    constructor(
        address[] memory assets,
        address[] memory sources,
        address tvlSource,
        uint256 stalePeriod
    ) public {
        _setAssetSources(assets, sources);
        _setTvlSource(tvlSource);
        _setStalePeriod(stalePeriod);
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
     * @param stalePeriod the length of time in seconds
     */
    function setStalePeriod(uint256 stalePeriod) external onlyOwner {
        _setStalePeriod(stalePeriod);
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
        unlocked
        returns (uint256)
    {
        if (_submittedAssetValues[asset].periodEnd >= block.number) {
            return _submittedAssetValues[asset].value;
        }
        AggregatorV3Interface source = _assetSources[asset];
        return _getPriceFromSource(source);
    }

    /**
     * @notice Set or replace asset price sources
     * @param assets the array of assets token addresses
     * @param sources the array of price sources (aggregators)
     */
    function _setAssetSources(address[] memory assets, address[] memory sources)
        internal
    {
        require(assets.length == sources.length, "INCONSISTENT_PARAMS_LENGTH");
        for (uint256 i = 0; i < assets.length; i++) {
            _setAssetSource(assets[i], sources[i]);
        }
    }

    /**
     * @notice Set a single asset price source
     * @param asset asset token address
     * @param source the price source (aggregator)
     */
    function _setAssetSource(address asset, address source) internal {
        require(source.isContract(), "INVALID_SOURCE");
        _assetSources[asset] = AggregatorV3Interface(source);
        emit AssetSourceUpdated(asset, source);
    }

    /**
     * @notice Set the source for TVL value
     * @param source the TVL source (aggregator)
     */
    function _setTvlSource(address source) internal {
        require(source.isContract(), "INVALID_SOURCE");
        _tvlSource = AggregatorV3Interface(source);
        emit TvlSourceUpdated(source);
    }

    /**
     * @notice Set the length of time before an agg value is considered stale
     * @param stalePeriod the length of time in seconds
     */
    function _setStalePeriod(uint256 stalePeriod) internal {
        require(stalePeriod > 0, "INVALID_STALE_PERIOD");
        _chainlinkStalePeriod = stalePeriod;
        emit StalePeriodUpdated(stalePeriod);
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
        require(address(source).isContract(), "INVALID_SOURCE");
        (, int256 price, , uint256 updatedAt, ) = source.latestRoundData();

        //we do not allow 0 values for chainlink
        require(price > 0, "MISSING_ASSET_VALUE");

        // solhint-disable not-rely-on-time
        require(
            block.timestamp.sub(updatedAt) <= _chainlinkStalePeriod,
            "CHAINLINK_STALE_DATA"
        );
        // solhint-enable not-rely-on-time

        return uint256(price);
    }

    /// @notice Gets the address of the source for an asset address
    /// @param asset The address of the asset
    /// @return address The address of the source
    function getAssetSource(address asset) external view returns (address) {
        return address(_assetSources[asset]);
    }

    /// @notice Gets the address of the TVL source
    /// @return address TVL source address
    function getTvlSource() external view returns (address) {
        return address(_tvlSource);
    }

    function getStalePeriod() external view returns (uint256) {
        return _chainlinkStalePeriod;
    }

    function setAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external override locked onlyOwner {
        // We do allow 0 values for submitted values
        _submittedAssetValues[asset] = Value(value, block.number.add(period));
    }

    function getTvl()
        external
        view
        override
        unlocked
        returns (uint256 value, uint256 expiry)
    {
        if (_submittedTvlValue.periodEnd >= block.number) {
            return _submittedTvlValue.value;
        }
        return _getPriceFromSource(_tvlSource);
    }

    function isUnlocked() public view override returns (bool) {
        return block.number >= _lockEnd;
    }

    function setLock(uint256 newPeriod) external onlyOwner {
        _lockEnd = block.number.add(newPeriod);
    }

    function setTvl(uint256 value, uint256 period)
        external
        override
        locked
        onlyOwner
    {
        // We do allow 0 values for submitted values
        _submittedTvlValue = Value(value, block.number.add(period));
    }
}
