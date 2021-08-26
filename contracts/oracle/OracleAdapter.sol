// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {Address, SafeMath} from "contracts/libraries/Imports.sol";

import {
    IERC20,
    IAddressRegistryV2,
    AccessControl
} from "contracts/common/Imports.sol";

import {IAddressRegistryV2} from "contracts/registry/Imports.sol";

import {
    AggregatorV3Interface,
    IOracleAdapter,
    IOverrideOracle,
    ILockingOracle
} from "./Imports.sol";

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
contract OracleAdapter is
    AccessControl,
    IOracleAdapter,
    IOverrideOracle,
    ILockingOracle
{
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

    event AddressRegistryChanged(address);

    modifier unlocked() {
        require(!isLocked(), "ORACLE_LOCKED");
        _;
    }

    /**
     * @notice Constructor
     * @param addressRegistry_ the address registry
     * @param assets the assets priced by sources
     * @param sources the source for each asset
     * @param tvlSource_ the source for the TVL value
     * @param chainlinkStalePeriod_ the number of seconds until a source value is stale
     */
    constructor(
        address addressRegistry_,
        address tvlSource_,
        address[] memory assets,
        address[] memory sources,
        uint256 chainlinkStalePeriod_,
        uint256 defaultLockPeriod_
    ) public {
        _setAddressRegistry(addressRegistry_);
        _setTvlSource(tvlSource_);
        _setAssetSources(assets, sources);
        _setChainlinkStalePeriod(chainlinkStalePeriod_);
        _setDefaultLockPeriod(defaultLockPeriod_);

        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(CONTRACT_ROLE, addressRegistry.mAptAddress());
        _setupRole(CONTRACT_ROLE, addressRegistry.tvlManagerAddress());
        _setupRole(ADMIN_ROLE, addressRegistry.getAddress("adminSafe"));
        _setupRole(EMERGENCY_ROLE, addressRegistry.getAddress("emergencySafe"));
    }

    function setDefaultLockPeriod(uint256 newPeriod)
        external
        override
        onlyAdminRole
    {
        _setDefaultLockPeriod(newPeriod);
        emit DefaultLockPeriodChanged(newPeriod);
    }

    function lock() external override onlyContractRole {
        _lockFor(defaultLockPeriod);
        emit DefaultLocked(msg.sender, defaultLockPeriod, lockEnd);
    }

    function emergencyUnlock() external override onlyEmergencyRole {
        _lockFor(0);
        emit Unlocked();
    }

    function lockFor(uint256 activePeriod) external override onlyContractRole {
        uint256 oldLockEnd = lockEnd;
        _lockFor(activePeriod);
        require(lockEnd > oldLockEnd, "CANNOT_SHORTEN_LOCK");
        emit Locked(msg.sender, activePeriod, lockEnd);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    //------------------------------------------------------------
    // MANUAL SUBMISSION SETTERS
    //------------------------------------------------------------

    function emergencySetAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external override onlyEmergencyRole {
        // We do allow 0 values for submitted values
        uint256 periodEnd = block.number.add(period);
        submittedAssetValues[asset] = Value(value, periodEnd);
        emit AssetValueSet(asset, value, period, periodEnd);
    }

    function emergencyUnsetAssetValue(address asset)
        external
        override
        onlyEmergencyRole
    {
        require(
            submittedAssetValues[asset].periodEnd != 0,
            "NO_ASSET_VALUE_SET"
        );
        submittedAssetValues[asset].periodEnd = block.number;
        emit AssetValueUnset(asset);
    }

    function emergencySetTvl(uint256 value, uint256 period)
        external
        override
        onlyEmergencyRole
    {
        // We do allow 0 values for submitted values
        uint256 periodEnd = block.number.add(period);
        submittedTvlValue = Value(value, periodEnd);
        emit TvlSet(value, period, periodEnd);
    }

    function emergencyUnsetTvl() external override onlyEmergencyRole {
        require(submittedTvlValue.periodEnd != 0, "NO_TVL_SET");
        submittedTvlValue.periodEnd = block.number;
        emit TvlUnset();
    }

    //------------------------------------------------------------
    // CHAINLINK SETTERS
    //------------------------------------------------------------

    /**
     * @notice Set or replace the TVL source
     * @param source the TVL source address
     */
    function emergencySetTvlSource(address source)
        external
        override
        onlyEmergencyRole
    {
        _setTvlSource(source);
    }

    /**
     * @notice Set or replace asset price sources
     * @param assets the array of assets token addresses
     * @param sources the array of price sources (aggregators)
     */
    function emergencySetAssetSources(
        address[] memory assets,
        address[] memory sources
    ) external override onlyEmergencyRole {
        _setAssetSources(assets, sources);
    }

    /**
     * @notice Set a single asset price source
     * @param asset asset token address
     * @param source the price source (aggregator)
     */
    function emergencySetAssetSource(address asset, address source)
        external
        override
        onlyEmergencyRole
    {
        _setAssetSource(asset, source);
    }

    /**
     * @notice Set the length of time before an agg value is considered stale
     * @param chainlinkStalePeriod_ the length of time in seconds
     */
    function setChainlinkStalePeriod(uint256 chainlinkStalePeriod_)
        external
        override
        onlyAdminRole
    {
        _setChainlinkStalePeriod(chainlinkStalePeriod_);
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

    function hasTvlOverride() public view override returns (bool) {
        return block.number < submittedTvlValue.periodEnd;
    }

    /**
     * @notice Gets an asset price by address
     * @param asset the asset address
     * @return the asset price
     */
    function getAssetPrice(address asset)
        external
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

    function hasAssetOverride(address asset)
        public
        view
        override
        returns (bool)
    {
        return block.number < submittedAssetValues[asset].periodEnd;
    }

    function _setDefaultLockPeriod(uint256 newPeriod) internal {
        defaultLockPeriod = newPeriod;
    }

    function _lockFor(uint256 activePeriod) internal {
        lockEnd = block.number.add(activePeriod);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }

    function _setChainlinkStalePeriod(uint256 chainlinkStalePeriod_) internal {
        require(chainlinkStalePeriod_ > 0, "INVALID_STALE_PERIOD");
        chainlinkStalePeriod = chainlinkStalePeriod_;
        emit ChainlinkStalePeriodUpdated(chainlinkStalePeriod_);
    }

    function _setTvlSource(address source) internal {
        require(source.isContract(), "INVALID_SOURCE");
        tvlSource = AggregatorV3Interface(source);
        emit TvlSourceUpdated(source);
    }

    function _setAssetSources(address[] memory assets, address[] memory sources)
        internal
    {
        require(assets.length == sources.length, "INCONSISTENT_PARAMS_LENGTH");
        for (uint256 i = 0; i < assets.length; i++) {
            _setAssetSource(assets[i], sources[i]);
        }
    }

    function _setAssetSource(address asset, address source) internal {
        require(source.isContract(), "INVALID_SOURCE");
        assetSources[asset] = AggregatorV3Interface(source);
        emit AssetSourceUpdated(asset, source);
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
