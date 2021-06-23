// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IOracleAdapter.sol";
import "./interfaces/IAddressRegistryV2.sol";

/**
 * @title Oracle Adapter
 * @author APY.Finance
 * @notice Acts as a gateway to oracle values and implements oracle safeguards.
 *
 * Oracle Safeguard Flows:
 *
 *      - Unlocked → No Manual Submitted Value → Use Chainlink Value (default)
 *      - Unlocked → No Manual Submitted Value → Chainlink Value == 0 → mAPT totalSupply == 0 → Use 0
 *      - Unlocked → No Manual Submitted Value → Chainlink Value == 0 → mAPT totalSupply > 0 → Reverts
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

    IAddressRegistryV2 public addressRegistry;

    uint256 public override defaultLockPeriod;
    /** @notice Contract is locked until this block number is passed */
    uint256 public lockEnd;

    /** @notice Chainlink variables */
    uint256 public chainlinkStalePeriod; // Duration of Chainlink heartbeat
    AggregatorV3Interface public tvlSource;
    mapping(address => AggregatorV3Interface) public assetSources;

    /** @notice Submitted values that override Chainlink values until stale */
    mapping(address => Value) public submittedAssetValues;
    Value public submittedTvlValue;

    event AssetSourceUpdated(address indexed asset, address indexed source);
    event TvlSourceUpdated(address indexed source);
    event ChainlinkStalePeriodUpdated(uint256 period);

    modifier unlocked() {
        require(!isLocked(), "ORACLE_LOCKED");
        _;
    }

    /**
     * @dev Reverts if non-permissioned account calls.
     * Permissioned accounts are: owner, mAPT, and TVL manager
     */
    modifier onlyPermissioned() {
        require(
            msg.sender == owner() ||
                msg.sender == addressRegistry.mAptAddress() ||
                msg.sender == addressRegistry.tvlManagerAddress(),
            "PERMISSIONED_ONLY"
        );
        _;
    }

    /**
     * @notice Constructor
     * @param addressRegistry_ the address registry
     * @param assets the assets priced by sources
     * @param sources the source for each asset
     * @param tvlSource the source for the TVL value
     * @param chainlinkStalePeriod_ the number of seconds until a source value is stale
     */
    constructor(
        address addressRegistry_,
        address tvlSource,
        address[] memory assets,
        address[] memory sources,
        uint256 chainlinkStalePeriod_,
        uint256 defaultLockPeriod_
    ) public {
        setAddressRegistry(addressRegistry_);
        setTvlSource(tvlSource);
        setAssetSources(assets, sources);
        setChainlinkStalePeriod(chainlinkStalePeriod_);
        setDefaultLockPeriod(defaultLockPeriod_);
    }

    function setDefaultLockPeriod(uint256 newPeriod) public override onlyOwner {
        defaultLockPeriod = newPeriod;
    }

    function lock() external override onlyPermissioned {
        lockFor(defaultLockPeriod);
    }

    function unlock() external override onlyPermissioned {
        lockFor(0);
    }

    function lockFor(uint256 activePeriod) public override onlyPermissioned {
        lockEnd = block.number.add(activePeriod);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function setAddressRegistry(address addressRegistry_) public onlyOwner {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }

    //------------------------------------------------------------
    // MANUAL SUBMISSION SETTERS
    //------------------------------------------------------------

    function setAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external override onlyOwner {
        // We do allow 0 values for submitted values
        submittedAssetValues[asset] = Value(value, block.number.add(period));
    }

    function unsetAssetValue(address asset) external override onlyOwner {
        require(
            submittedAssetValues[asset].periodEnd != 0,
            "NO_ASSET_VALUE_SET"
        );
        submittedAssetValues[asset].periodEnd = block.number;
    }

    function setTvl(uint256 value, uint256 period) external override onlyOwner {
        // We do allow 0 values for submitted values
        submittedTvlValue = Value(value, block.number.add(period));
    }

    function unsetTvl() external override onlyOwner {
        require(submittedTvlValue.periodEnd != 0, "NO_TVL_SET");
        submittedTvlValue.periodEnd = block.number;
    }

    //------------------------------------------------------------
    // CHAINLINK SETTERS
    //------------------------------------------------------------

    /**
     * @notice Set or replace the TVL source
     * @param source the TVL source address
     */
    function setTvlSource(address source) public onlyOwner {
        require(source.isContract(), "INVALID_SOURCE");
        tvlSource = AggregatorV3Interface(source);
        emit TvlSourceUpdated(source);
    }

    /**
     * @notice Set or replace asset price sources
     * @param assets the array of assets token addresses
     * @param sources the array of price sources (aggregators)
     */
    function setAssetSources(address[] memory assets, address[] memory sources)
        public
        onlyOwner
    {
        require(assets.length == sources.length, "INCONSISTENT_PARAMS_LENGTH");
        for (uint256 i = 0; i < assets.length; i++) {
            setAssetSource(assets[i], sources[i]);
        }
    }

    /**
     * @notice Set a single asset price source
     * @param asset asset token address
     * @param source the price source (aggregator)
     */
    function setAssetSource(address asset, address source) public onlyOwner {
        require(source.isContract(), "INVALID_SOURCE");
        assetSources[asset] = AggregatorV3Interface(source);
        emit AssetSourceUpdated(asset, source);
    }

    /**
     * @notice Set the length of time before an agg value is considered stale
     * @param chainlinkStalePeriod_ the length of time in seconds
     */
    function setChainlinkStalePeriod(uint256 chainlinkStalePeriod_)
        public
        onlyOwner
    {
        require(chainlinkStalePeriod_ > 0, "INVALID_STALE_PERIOD");
        chainlinkStalePeriod = chainlinkStalePeriod_;
        emit ChainlinkStalePeriodUpdated(chainlinkStalePeriod_);
    }

    function isLocked() public view override returns (bool) {
        return block.number < lockEnd;
    }

    //------------------------------------------------------------
    // ORACLE VALUE GETTERS
    //------------------------------------------------------------

    /**
     * @notice Get the TVL
     * @dev Zero values are considered valid if there is no mAPT minted,
     * and therefore no PoolTokenV2 liquidity in the LP Safe.
     * @return the TVL
     */
    function getTvl() external view override unlocked returns (uint256) {
        if (hasTvlOverride()) {
            return submittedTvlValue.value;
        }

        uint256 price = _getPriceFromSource(tvlSource);

        require(
            price > 0 ||
                IERC20(addressRegistry.mAptAddress()).totalSupply() == 0,
            "INVALID_ZERO_TVL"
        );

        return price;
    }

    function hasTvlOverride() public view returns (bool) {
        return block.number < submittedTvlValue.periodEnd;
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
        if (hasAssetOverride(asset)) {
            return submittedAssetValues[asset].value;
        }

        AggregatorV3Interface source = assetSources[asset];
        uint256 price = _getPriceFromSource(source);

        //we do not allow 0 values for chainlink
        require(price > 0, "MISSING_ASSET_VALUE");

        return price;
    }

    function hasAssetOverride(address asset) public view returns (bool) {
        return block.number < submittedAssetValues[asset].periodEnd;
    }

    /**
     * @notice Get the price from a source (aggregator)
     * @return the price from the source
     */
    function _getPriceFromSource(AggregatorV3Interface source)
        internal
        view
        returns (uint256)
    {
        require(address(source).isContract(), "INVALID_SOURCE");
        (, int256 price, , uint256 updatedAt, ) = source.latestRoundData();

        // must be negative for cast to uint
        require(price >= 0, "NEGATIVE_VALUE");

        // solhint-disable not-rely-on-time
        require(
            block.timestamp.sub(updatedAt) <= chainlinkStalePeriod,
            "CHAINLINK_STALE_DATA"
        );
        // solhint-enable not-rely-on-time

        return uint256(price);
    }
}
