// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20, IEmergencyExit} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";
import {
    Initializable,
    ERC20UpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    AccessControlUpgradeSafe,
    Address as AddressUpgradeSafe,
    SafeMath as SafeMathUpgradeSafe,
    SignedSafeMath as SignedSafeMathUpgradeSafe
} from "contracts/proxy/Imports.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {
    AggregatorV3Interface,
    IOracleAdapter
} from "contracts/oracle/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";

import {IERC4626, IFeePool, ILockingPool, IReservePool} from "./Imports.sol";

/**
 * @notice Collect user deposits so they can be lent to the LP Account
 * @notice Depositors share pool liquidity
 * @notice Reserves are maintained to process withdrawals
 * @notice Reserve tokens cannot be lent to the LP Account
 * @notice If a user withdraws too early after their deposit, there's a fee
 * @notice Tokens borrowed from the pool are tracked with the `MetaPoolToken`
 */
contract IndexToken is
    IERC4626,
    IEmergencyExit,
    IFeePool,
    ILockingPool,
    IReservePool,
    Initializable,
    AccessControlUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    ERC20UpgradeSafe
{
    using AddressUpgradeSafe for address;
    using SafeMathUpgradeSafe for uint256;
    using SignedSafeMathUpgradeSafe for int256;
    using SafeERC20 for IDetailedERC20;

    uint256 internal constant ARB_FEE_DENOMINATOR = 100;
    uint256 internal constant WITHDRAW_FEE_DENOMINATOR = 1000000;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    /**
     * @notice registry to fetch core platform addresses from
     * @dev this slot replaces the last V1 slot for the price agg
     */
    IAddressRegistryV2 public addressRegistry;

    /** @notice true if depositing is locked */
    bool public depositLock;
    /** @notice true if withdrawing is locked */
    bool public redeemLock;

    /** @notice underlying stablecoin */
    address public override asset;

    /** @notice time of last deposit */
    mapping(address => uint256) public lastDepositTime;
    /** @notice seconds since last deposit during which arbitrage fee is charged */
    uint256 public override arbitrageFeePeriod;
    /** @notice percentage charged for arbitrage fee */
    uint256 public override arbitrageFee;

    /**
     *@notice fee charged for all withdrawals in 1/100th basis points,
     * e.g. 100 = 1 bps
     */
    uint256 public override withdrawFee;

    /** @notice percentage of pool total value available for immediate withdrawal */
    uint256 public override reservePercentage;

    /* ------------------------------- */

    /** @notice Log when the address registry is changed */
    event AddressRegistryChanged(address);

    /**
     * @dev Since the proxy delegate calls to this "logic" contract, any
     * storage set by the logic contract's constructor during deploy is
     * disregarded and this function is needed to initialize the proxy
     * contract's storage according to this contract's layout.
     *
     * Since storage is not set yet, there is no simple way to protect
     * calling this function with owner modifiers.  Thus the OpenZeppelin
     * `initializer` modifier protects this function from being called
     * repeatedly.  It should be called during the deployment so that
     * it cannot be called by someone else later.
     */
    function initialize(address addressRegistry_, address underlyer_)
        external
        initializer
    {
        require(address(underlyer_) != address(0), "INVALID_TOKEN");

        // initialize ancestor storage
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("Convex Index Token", "idxCVX");

        // initialize impl-specific storage
        depositLock = false;
        redeemLock = false;
        asset = underlyer_;

        _setAddressRegistry(addressRegistry_);

        // FIXME: these need to be Cortex DAO addresses
        _setupRole(DEFAULT_ADMIN_ROLE, addressRegistry.emergencySafeAddress());
        _setupRole(ADMIN_ROLE, addressRegistry.adminSafeAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.emergencySafeAddress());
        _setupRole(CONTRACT_ROLE, addressRegistry.mAptAddress());

        arbitrageFeePeriod = 1 days;
        arbitrageFee = 5;
        reservePercentage = 5;
        withdrawFee = 1000;
    }

    /**
     * @notice initialize storage for the V2 upgrade
     * @dev Note the `initializer` modifier can only be used once in the
     * entire contract, so we can't use it here.  Instead, we protect
     * the upgrade init with the `onlyProxyAdmin` modifier, which checks
     * `msg.sender` against the proxy admin slot defined in EIP-1967.
     * This will only allow the proxy admin to call this function during upgrades.
     */
    function initializeV2() external nonReentrant onlyProxyAdmin {} // solhint-disable-line no-empty-blocks

    function emergencyLock() external override onlyEmergencyRole {
        _pause();
    }

    function emergencyUnlock() external override onlyEmergencyRole {
        _unpause();
    }

    /**
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function deposit(uint256 assets, address receiver)
        external
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        require(!depositLock, "LOCKED");
        require(assets > 0, "AMOUNT_INSUFFICIENT");
        require(
            IDetailedERC20(asset).allowance(msg.sender, address(this)) >=
                assets,
            "ALLOWANCE_INSUFFICIENT"
        );
        // solhint-disable-next-line not-rely-on-time
        lastDepositTime[receiver] = block.timestamp;

        shares = convertToShares(assets);

        _mint(receiver, shares);
        IDetailedERC20(asset).safeTransferFrom(
            msg.sender,
            address(this),
            assets
        );

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver)
        external
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        require(shares > 0, "AMOUNT_INSUFFICIENT");

        assets = previewMint(shares);
        require(
            IDetailedERC20(asset).allowance(msg.sender, address(this)) >=
                assets,
            "ALLOWANCE_INSUFFICIENT"
        );
        // solhint-disable-next-line not-rely-on-time
        // lastDepositTime[receiver] = block.timestamp;

        _mint(receiver, shares);
        IDetailedERC20(asset).safeTransferFrom(
            msg.sender,
            address(this),
            assets
        );

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function emergencyLockDeposit()
        external
        override
        nonReentrant
        onlyEmergencyRole
    {
        depositLock = true;
        emit DepositLocked();
    }

    function emergencyUnlockDeposit()
        external
        override
        nonReentrant
        onlyEmergencyRole
    {
        depositLock = false;
        emit DepositUnlocked();
    }

    /**
     * @dev May revert if there is not enough in the pool.
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    )
        external
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        require(!redeemLock, "LOCKED");
        require(shares > 0, "AMOUNT_INSUFFICIENT");
        require(shares <= balanceOf(owner), "BALANCE_INSUFFICIENT");
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= shares, "ALLOWANCE_INSUFFICIENT");
            // save gas for infinite approvals
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed.sub(shares));
            }
        }

        assets = previewRedeem(shares, owner);
        require(
            assets <= IDetailedERC20(asset).balanceOf(address(this)),
            "RESERVE_INSUFFICIENT"
        );

        _burn(owner, shares);
        IDetailedERC20(asset).safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    )
        external
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        require(!redeemLock, "LOCKED");
        require(assets > 0, "AMOUNT_INSUFFICIENT");
        require(
            assets <= IDetailedERC20(asset).balanceOf(address(this)),
            "RESERVE_INSUFFICIENT"
        );

        shares = previewWithdraw(assets, owner); // No need to check for rounding error, previewWithdraw rounds up.
        require(shares <= balanceOf(owner), "BALANCE_INSUFFICIENT");
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= shares, "ALLOWANCE_INSUFFICIENT");
            // save gas for infinite approvals
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed.sub(shares));
            }
        }

        _burn(owner, shares);
        IDetailedERC20(asset).safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function emergencyLockRedeem()
        external
        override
        nonReentrant
        onlyEmergencyRole
    {
        redeemLock = true;
        emit RedeemLocked();
    }

    function emergencyUnlockRedeem()
        external
        override
        nonReentrant
        onlyEmergencyRole
    {
        redeemLock = false;
        emit RedeemUnlocked();
    }

    /**
     * @dev permissioned with CONTRACT_ROLE
     */
    function transferToLpAccount(uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
        onlyContractRole
    {
        IDetailedERC20(asset).safeTransfer(
            addressRegistry.lpAccountAddress(),
            amount
        );
    }

    /**
     * @notice Set the new address registry
     * @param addressRegistry_ The new address registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        nonReentrant
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    function setArbitrageFee(uint256 feePercentage, uint256 feePeriod)
        external
        override
        nonReentrant
        onlyAdminRole
    {
        arbitrageFee = feePercentage;
        arbitrageFeePeriod = feePeriod;
        emit ArbitrageFeePeriodChanged(feePeriod);
        emit ArbitrageFeeChanged(feePercentage);
    }

    function setReservePercentage(uint256 reservePercentage_)
        external
        override
        nonReentrant
        onlyAdminRole
    {
        reservePercentage = reservePercentage_;
        emit ReservePercentageChanged(reservePercentage_);
    }

    function setWithdrawFee(uint256 withdrawFee_)
        external
        override
        nonReentrant
        onlyAdminRole
    {
        withdrawFee = withdrawFee_;
        emit WithdrawFeeChanged(withdrawFee_);
    }

    function emergencyExit(address token) external override onlyEmergencyRole {
        address emergencySafe = addressRegistry.emergencySafeAddress();
        IDetailedERC20 token_ = IDetailedERC20(token);
        uint256 balance = token_.balanceOf(address(this));
        token_.safeTransfer(emergencySafe, balance);

        emit EmergencyExit(emergencySafe, token_, balance);
    }

    function getUsdValue(uint256 aptAmount) external view returns (uint256) {
        if (aptAmount == 0) return 0;
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        return aptAmount.mul(getPoolTotalValue()).div(totalSupply());
    }

    function getReserveTopUpValue() external view override returns (int256) {
        int256 topUpValue = _getReserveTopUpValue();
        if (topUpValue == 0) {
            return 0;
        }

        // Should never revert because the OracleAdapter converts from int256
        uint256 price = getUnderlyerPrice();
        require(price <= uint256(type(int256).max), "INVALID_PRICE");

        int256 topUpAmount =
            topUpValue
                .mul(int256(10**uint256(IDetailedERC20(asset).decimals())))
                .div(int256(getUnderlyerPrice()));

        return topUpAmount;
    }

    function previewDeposit(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToAssets(shares).add(1);
    }

    function previewWithdraw(uint256 assets, address owner)
        public
        view
        virtual
        returns (uint256)
    {
        bool arbFee = hasArbFee(owner);
        return _previewWithdraw(assets, arbFee);
    }

    function previewWithdraw(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _previewWithdraw(assets, true);
    }

    function maxDeposit(address)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return type(uint256).max;
    }

    function maxMint(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address owner)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToAssets(balanceOf(owner));
    }

    function maxRedeem(address owner)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return balanceOf(owner);
    }

    /**
     * @dev To check if arbitrage fee will be applied, use `hasArbFee`.
     */
    function previewRedeem(uint256 aptAmount, address owner)
        public
        view
        returns (uint256)
    {
        bool arbFee = hasArbFee(owner);
        return _previewRedeem(aptAmount, arbFee);
    }

    function previewRedeem(uint256 aptAmount)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _previewRedeem(aptAmount, true);
    }

    /**
     * @dev `lastDepositTime` is stored each time user makes a deposit, so
     * the waiting period is restarted on each deposit.
     */
    function hasArbFee(address owner) public view override returns (bool) {
        // solhint-disable not-rely-on-time
        return block.timestamp.sub(lastDepositTime[owner]) < arbitrageFeePeriod;
        // solhint-enable
    }

    /**
     * @dev Total value also includes that have been borrowed from the pool
     * @dev Typically it is the LP Account that borrows from the pool
     */
    function getPoolTotalValue() public view returns (uint256) {
        uint256 underlyerValue = _getPoolUnderlyerValue();
        uint256 mAptValue = _getDeployedValue();
        return underlyerValue.add(mAptValue);
    }

    function getValueFromUnderlyerAmount(uint256 underlyerAmount)
        public
        view
        returns (uint256)
    {
        if (underlyerAmount == 0) {
            return 0;
        }
        uint256 decimals = IDetailedERC20(asset).decimals();
        return getUnderlyerPrice().mul(underlyerAmount).div(10**decimals);
    }

    function getUnderlyerPrice() public view returns (uint256) {
        IOracleAdapter oracleAdapter =
            IOracleAdapter(addressRegistry.oracleAdapterAddress());
        return oracleAdapter.getAssetPrice(address(asset));
    }

    /**
     * @dev amount of APT minted should be in same ratio to APT supply
     * as deposit value is to pool's total value, i.e.:
     *
     * mint amount / total supply
     * = deposit value / pool total value
     *
     * For denominators, pre or post-deposit amounts can be used.
     * The important thing is they are consistent, i.e. both pre-deposit
     * or both post-deposit.
     */
    function convertToShares(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256)
    {
        uint256 supply = totalSupply();
        if (supply == 0) return assets;

        // mathematically equivalent to:
        // assets.mul(supply).div(totalAssets())
        // but better precision due to avoiding early division
        uint256 totalValue = getPoolTotalValue();
        uint256 assetPrice = getUnderlyerPrice();
        uint256 decimals = IDetailedERC20(asset).decimals();
        return
            assets.mul(supply).mul(assetPrice).div(totalValue).div(
                10**decimals
            );
    }

    function convertToAssets(uint256 shares)
        public
        view
        virtual
        override
        returns (uint256)
    {
        if (shares == 0) return 0;

        uint256 supply = totalSupply();
        if (supply == 0) return shares;

        // mathematically equivalent to:
        // shares.mul(totalAssets()).div(supply)
        // but better precision due to avoiding early division
        uint256 totalValue = getPoolTotalValue();
        uint256 assetPrice = getUnderlyerPrice();
        uint256 decimals = IDetailedERC20(asset).decimals();
        return
            shares.mul(totalValue).mul(10**decimals).div(assetPrice).div(
                supply
            );
    }

    function totalAssets() public view virtual override returns (uint256) {
        uint256 totalValue = getPoolTotalValue();
        uint256 assetPrice = getUnderlyerPrice();
        uint256 decimals = IDetailedERC20(asset).decimals();
        return totalValue.mul(10**decimals).div(assetPrice);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }

    /**
     * @dev This "top-up" value should satisfy:
     *
     * top-up USD value + pool underlyer USD value
     * = (reserve %) * pool deployed value (after unwinding)
     *
     * @dev Taking the percentage of the pool's current deployed value
     * is not sufficient, because the requirement is to have the
     * resulting values after unwinding capital satisfy the
     * above equation.
     *
     * More precisely:
     *
     * R_pre = pool underlyer USD value before pushing unwound
     *         capital to the pool
     * R_post = pool underlyer USD value after pushing
     * DV_pre = pool's deployed USD value before unwinding
     * DV_post = pool's deployed USD value after unwinding
     * rPerc = the reserve percentage as a whole number
     *                     out of 100
     *
     * We want:
     *
     *     R_post = (rPerc / 100) * DV_post          (equation 1)
     *
     *     where R_post = R_pre + top-up value
     *           DV_post = DV_pre - top-up value
     *
     * Making the latter substitutions in equation 1, gives:
     *
     * top-up value = (rPerc * DV_pre - 100 * R_pre) / (100 + rPerc)
     */
    function _getReserveTopUpValue() internal view returns (int256) {
        uint256 unnormalizedTargetValue =
            _getDeployedValue().mul(reservePercentage);
        uint256 unnormalizedUnderlyerValue = _getPoolUnderlyerValue().mul(100);

        require(
            unnormalizedTargetValue <= uint256(type(int256).max),
            "SIGNED_INT_OVERFLOW"
        );
        require(
            unnormalizedUnderlyerValue <= uint256(type(int256).max),
            "SIGNED_INT_OVERFLOW"
        );
        int256 topUpValue =
            int256(unnormalizedTargetValue)
                .sub(int256(unnormalizedUnderlyerValue))
                .div(int256(reservePercentage).add(100));
        return topUpValue;
    }

    /**
     * @notice Get the USD value of tokens in the pool
     * @return The USD value
     */
    function _getPoolUnderlyerValue() internal view returns (uint256) {
        return
            getValueFromUnderlyerAmount(
                IDetailedERC20(asset).balanceOf(address(this))
            );
    }

    /**
     * @notice Get the USD value of tokens owed to the pool
     * @dev Tokens from the pool are typically borrowed by the LP Account
     * @dev Tokens borrowed from the pool are tracked with mAPT
     * @return The USD value
     */
    function _getDeployedValue() internal view returns (uint256) {
        MetaPoolToken mApt = MetaPoolToken(addressRegistry.mAptAddress());
        return mApt.getDeployedValue(address(this));
    }

    function _previewRedeem(uint256 aptAmount, bool arbFee)
        internal
        view
        returns (uint256)
    {
        uint256 underlyerAmount = convertToAssets(aptAmount);
        return _getUnderlyerAmountAfterFees(underlyerAmount, arbFee);
    }

    function _previewWithdraw(uint256 assets, bool arbFee)
        internal
        view
        returns (uint256)
    {
        uint256 assetsBeforeFees =
            _getUnderlyerAmountBeforeFees(assets, arbFee);
        return convertToShares(assetsBeforeFees).add(1);
    }

    function _getUnderlyerAmountAfterFees(uint256 underlyerAmount, bool arbFee)
        internal
        view
        returns (uint256)
    {
        uint256 withdrawFeeAmount =
            underlyerAmount.mul(withdrawFee).div(WITHDRAW_FEE_DENOMINATOR);
        uint256 underlyerAmountWithFee = underlyerAmount.sub(withdrawFeeAmount);

        if (arbFee) {
            uint256 arbFeeAmount =
                underlyerAmount.mul(arbitrageFee).div(ARB_FEE_DENOMINATOR);
            underlyerAmountWithFee = underlyerAmountWithFee.sub(arbFeeAmount);
        }

        return underlyerAmountWithFee;
    }

    function _getUnderlyerAmountBeforeFees(uint256 underlyerAmount, bool arbFee)
        internal
        view
        returns (uint256 underlyerAmountBeforeFee)
    {
        if (arbFee) {
            underlyerAmountBeforeFee = underlyerAmount
                .mul(WITHDRAW_FEE_DENOMINATOR)
                .mul(ARB_FEE_DENOMINATOR)
                .div(
                WITHDRAW_FEE_DENOMINATOR
                    .mul(ARB_FEE_DENOMINATOR)
                    .sub(withdrawFee.mul(ARB_FEE_DENOMINATOR))
                    .sub(arbitrageFee.mul(WITHDRAW_FEE_DENOMINATOR))
            );
        } else {
            underlyerAmountBeforeFee = underlyerAmount
                .mul(WITHDRAW_FEE_DENOMINATOR)
                .div(WITHDRAW_FEE_DENOMINATOR.sub(withdrawFee));
        }
    }
}
