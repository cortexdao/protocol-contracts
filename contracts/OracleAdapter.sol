// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IOracleAdapter.sol";

contract OracleAdapter is Ownable, IOracleAdapter {
    using SafeMath for uint256;

    mapping(address => AggregatorV3Interface) private _assetSources;
    AggregatorV3Interface private _tvlSource;
    IOracleAdapter private _fallbackOracle;

    event AssetSourceUpdated(address indexed asset, address indexed source);
    event TvlSourceUpdated(address indexed source);
    event FallbackOracleUpdated(address indexed fallbackOracle);

    /**
     * @notice Constructor
     * @param assets the assets priced by sources
     * @param sources the source for each asset
     * @param tvlSource the source for the TVL value
     * @param fallbackOracle the fallback used in case of pricing problems
     */
    constructor(
        address[] memory assets,
        address[] memory sources,
        address tvlSource,
        address fallbackOracle
    ) public {
        _setAssetSources(assets, sources);
        _setTvlSource(tvlSource);
        _setFallbackOracle(fallbackOracle);
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
     * @notice Set the fallbackOracle
     * @param fallbackOracle the fallback oracle address
     */
    function setFallbackOracle(address fallbackOracle) external onlyOwner {
        _setFallbackOracle(fallbackOracle);
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
        AggregatorV3Interface source = _assetSources[asset];

        uint256 price = _getPriceFromSource(source);

        if (price > 0) {
            return price;
        } else {
            require(
                address(_fallbackOracle) != address(0),
                "NO_FALLBACK_ORACLE"
            );
            return _fallbackOracle.getAssetPrice(asset);
        }
    }

    /**
     * @notice Get the TVL value
     * @return the TVL
     */
    function getTVL() public view override returns (uint256) {
        uint256 price = _getPriceFromSource(_tvlSource);

        if (price > 0) {
            return price;
        } else {
            require(
                address(_fallbackOracle) != address(0),
                "NO_FALLBACK_ORACLE"
            );
            return _fallbackOracle.getTVL();
        }
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
            _assetSources[assets[i]] = AggregatorV3Interface(sources[i]);
            emit AssetSourceUpdated(assets[i], sources[i]);
        }
    }

    /**
     * @notice Set the source for TVL value
     * @param source the TVL source (aggregator)
     */
    function _setTvlSource(address source) private {
        require(source != address(0), "INVALID_SOURCE");
        _tvlSource = AggregatorV3Interface(source);
        emit TvlSourceUpdated(source);
    }

    /**
     * @notice Set the fallbackOracle
     * @param fallbackOracle the fallback oracle
     */
    function _setFallbackOracle(address fallbackOracle) private {
        require(fallbackOracle != address(0), "INVALID_FALLBACK_ORACLE");
        _fallbackOracle = IOracleAdapter(fallbackOracle);
        emit FallbackOracleUpdated(fallbackOracle);
    }

    /**
     * @notice Get the price from a source (aggregator)
     * @return the price from the source
     */
    function _getPriceFromSource(AggregatorV3Interface source)
        private
        view
        returns (uint256)
    {
        if (address(source) != address(0)) {
            (, int256 price, , , ) = source.latestRoundData();

            if (price > 0) {
                return uint256(price);
            }
        }

        return 0;
    }
}
