// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IOracleAdapter.sol";

/**
 * @title Oracle Adapter
 * @author APY.Finance
 * @notice Acts as a gateway to oracle values and implements oracle safeguards.
 *
 * Oracle Safeguard Flows:
 *
 *      - Unlocked → No Manual Submitted Value → Use Chainlink Value (default)
 *      - Unlocked → No Manual Submitted Value → No Chainlink Source → Reverts
 *      - Unlocked → No Manual Submitted Value → Chainlink Value Call Reverts → Reverts
 *      - Unlocked → No Manual Submitted Value → Chainlink Value > 24 hours → Reverts
 *      - Unlocked → Use Manual Submitted Value (emergency)
 *      - Locked → Reverts (nominal)
 *
 * @dev It is important to not that zero values are allowed for manual
 * submission, but will result in a revert for Chainlink.
 *
 * This is because there are very rare situations where the TVL value can
 * accurately be zero, such as a situation where all funds are unwound and
 * moved back to the liquidity pools, but a zero value can also indicate a
 * failure with Chainlink.
 *
 * Because accurate zero values are rare, and occur due to intentional system
 * states where no funds are deployed, they due not need to be detected
 * automatically by Chainlink.
 *
 * In addition, the impact of failing to manually set a zero value when
 * necessary compared to the impact of an incorrect zero value from Chainlink
 * is much lower.
 *
 * Failing to manually set a zero value can result in either a locked contract,
 * which can be unlocked by setting the value, or reduced deposit/withdraw
 * amounts. But never a loss of funds.
 *
 * Conversely, if Chainlink reports a zero value in error and the contract
 * were to accept it, funds up to the amount available in the reserve pools
 * could be lost.
 */
contract OracleAdapter is Ownable, IOracleAdapter {
    using SafeMath for uint256;
    using Address for address;

    /// @notice Contract is locked until this block number is passed
    uint256 private _lockEnd;

    /// @notice Chainlink variables
    uint256 private _chainlinkStalePeriod; // Duration of Chainlink heartbeat
    AggregatorV3Interface private _tvlSource;
    mapping(address => AggregatorV3Interface) private _assetSources;

    /// @notice Submitted values that override Chainlink values until stale
    mapping(address => Value) private _submittedAssetValues;
    Value private _submittedTvlValue;

    event AssetSourceUpdated(address indexed asset, address indexed source);
    event TvlSourceUpdated(address indexed source);
    event ChainlinkStalePeriodUpdated(uint256 chainlinkStalePeriod);

    modifier unlocked() {
        require(!isLocked(), "ORACLE_LOCKED");
        _;
    }

    modifier locked() {
        require(isLocked(), "ORACLE_UNLOCKED");
        _;
    }

    /**
     * @notice Constructor
     * @param assets the assets priced by sources
     * @param sources the source for each asset
     * @param tvlSource the source for the TVL value
     * @param chainlinkStalePeriod the number of seconds until a source value is stale
     */
    constructor(
        address[] memory assets,
        address[] memory sources,
        address tvlSource,
        uint256 chainlinkStalePeriod
    ) public {
        _setAssetSources(assets, sources);
        _setTvlSource(tvlSource);
        _setChainlinkStalePeriod(chainlinkStalePeriod);
    }

    function setLock(uint256 newPeriod) external override onlyOwner {
        _lockEnd = block.number.add(newPeriod);
    }

    //------------------------------------------------------------
    //
    // MANUAL SUBMISSION SETTERS
    //
    //------------------------------------------------------------

    function setAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external override locked onlyOwner {
        // We do allow 0 values for submitted values
        _submittedAssetValues[asset] = Value(value, block.number.add(period));
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

    //------------------------------------------------------------
    //
    // CHAINLINK SETTERS
    //
    //------------------------------------------------------------

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
     * @param chainlinkStalePeriod the length of time in seconds
     */
    function setChainlinkStalePeriod(uint256 chainlinkStalePeriod)
        external
        onlyOwner
    {
        _setChainlinkStalePeriod(chainlinkStalePeriod);
    }

    //------------------------------------------------------------
    //
    // GLOBAL GETTERS
    //
    //------------------------------------------------------------

    function isLocked() public view override returns (bool) {
        return block.number < _lockEnd;
    }

    //------------------------------------------------------------
    //
    // ORACLE VALUE GETTERS
    //
    //------------------------------------------------------------

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

    function getTvl() external view override unlocked returns (uint256) {
        if (_submittedTvlValue.periodEnd >= block.number) {
            return _submittedTvlValue.value;
        }
        return _getPriceFromSource(_tvlSource);
    }

    //------------------------------------------------------------
    //
    // CHAINLINK GETTERS
    //
    //------------------------------------------------------------

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

    function getChainlinkStalePeriod() external view returns (uint256) {
        return _chainlinkStalePeriod;
    }

    //------------------------------------------------------------
    //
    // INTERNAL FUNCTIONS
    //
    //------------------------------------------------------------

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
     * @param chainlinkStalePeriod the length of time in seconds
     */
    function _setChainlinkStalePeriod(uint256 chainlinkStalePeriod) internal {
        require(chainlinkStalePeriod > 0, "INVALID_STALE_PERIOD");
        _chainlinkStalePeriod = chainlinkStalePeriod;
        emit ChainlinkStalePeriodUpdated(chainlinkStalePeriod);
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
}
