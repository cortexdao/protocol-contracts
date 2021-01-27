// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SignedSafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/ILiquidityPool.sol";
import "./interfaces/IDetailedERC20.sol";
import "./APYMetaPoolToken.sol";

contract APYPoolTokenV2 is
    ILiquidityPool,
    Initializable,
    OwnableUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    ERC20UpgradeSafe
{
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeERC20 for IDetailedERC20;
    uint256 public constant DEFAULT_APT_TO_UNDERLYER_FACTOR = 1000;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */

    // V1
    address public proxyAdmin;
    bool public addLiquidityLock;
    bool public redeemLock;
    IDetailedERC20 public underlyer;
    AggregatorV3Interface public priceAgg;

    // V2
    APYMetaPoolToken public mApt;
    uint256 public feePeriod;
    uint256 public feePercentage;
    mapping(address => uint256) public lastDepositTime;
    uint256 public reservePercentage;

    /* ------------------------------- */

    function initialize(
        address adminAddress,
        IDetailedERC20 _underlyer,
        AggregatorV3Interface _priceAgg
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(address(_underlyer) != address(0), "INVALID_TOKEN");
        require(address(_priceAgg) != address(0), "INVALID_AGG");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY Pool Token", "APT");

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        addLiquidityLock = false;
        redeemLock = false;
        underlyer = _underlyer;
        setPriceAggregator(_priceAgg);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function initializeUpgrade(address payable _mApt)
        external
        virtual
        onlyAdmin
    {
        mApt = APYMetaPoolToken(_mApt);
        feePeriod = 1 days;
        feePercentage = 5;
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function setPriceAggregator(AggregatorV3Interface _priceAgg)
        public
        onlyOwner
    {
        require(address(_priceAgg) != address(0), "INVALID_AGG");
        priceAgg = _priceAgg;
        emit PriceAggregatorChanged(address(_priceAgg));
    }

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        mApt = APYMetaPoolToken(_mApt);
    }

    function setFeePeriod(uint256 _feePeriod) public onlyOwner {
        feePeriod = _feePeriod;
    }

    function setFeePercentage(uint256 _feePercentage) public onlyOwner {
        feePercentage = _feePercentage;
    }

    function setReservePercentage(uint256 _reservePercentage) public onlyOwner {
        reservePercentage = _reservePercentage;
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    function lock() external onlyOwner {
        _pause();
    }

    function unlock() external onlyOwner {
        _unpause();
    }

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    /**
     * @notice Mint corresponding amount of APT tokens for sent token amount.
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity(uint256 tokenAmt)
        external
        virtual
        override
        nonReentrant
        whenNotPaused
    {
        require(!addLiquidityLock, "LOCKED");
        require(tokenAmt > 0, "AMOUNT_INSUFFICIENT");
        require(
            underlyer.allowance(msg.sender, address(this)) >= tokenAmt,
            "ALLOWANCE_INSUFFICIENT"
        );
        // solhint-disable-next-line not-rely-on-time
        lastDepositTime[msg.sender] = block.timestamp;

        // calculateMintAmount() is not used because deposit value
        // is needed for the event
        uint256 depositEthValue = getEthValueFromTokenAmount(tokenAmt);
        uint256 poolTotalEthValue = getPoolTotalEthValue();
        uint256 mintAmount =
            _calculateMintAmount(depositEthValue, poolTotalEthValue);

        _mint(msg.sender, mintAmount);
        underlyer.safeTransferFrom(msg.sender, address(this), tokenAmt);

        emit DepositedAPT(
            msg.sender,
            underlyer,
            tokenAmt,
            mintAmount,
            depositEthValue,
            getPoolTotalEthValue()
        );
    }

    /** @notice Disable deposits. */
    function lockAddLiquidity() external onlyOwner {
        addLiquidityLock = true;
        emit AddLiquidityLocked();
    }

    /** @notice Enable deposits. */
    function unlockAddLiquidity() external onlyOwner {
        addLiquidityLock = false;
        emit AddLiquidityUnlocked();
    }

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount)
        external
        virtual
        override
        nonReentrant
        whenNotPaused
    {
        require(!redeemLock, "LOCKED");
        require(aptAmount > 0, "AMOUNT_INSUFFICIENT");
        require(aptAmount <= balanceOf(msg.sender), "BALANCE_INSUFFICIENT");

        uint256 redeemTokenAmt = getUnderlyerAmountWithFee(aptAmount);
        require(
            redeemTokenAmt <= underlyer.balanceOf(address(this)),
            "RESERVE_INSUFFICIENT"
        );

        _burn(msg.sender, aptAmount);
        underlyer.safeTransfer(msg.sender, redeemTokenAmt);

        emit RedeemedAPT(
            msg.sender,
            underlyer,
            redeemTokenAmt,
            aptAmount,
            getEthValueFromTokenAmount(redeemTokenAmt),
            getPoolTotalEthValue()
        );
    }

    /** @notice Disable APT redeeming. */
    function lockRedeem() external onlyOwner {
        redeemLock = true;
        emit RedeemLocked();
    }

    /** @notice Enable APT redeeming. */
    function unlockRedeem() external onlyOwner {
        redeemLock = false;
        emit RedeemUnlocked();
    }

    /** @notice Calculate APT amount to be minted from deposit amount.
     *  @param tokenAmt The deposit amount of stablecoin
     *  @return The mint amount
     */
    function calculateMintAmount(uint256 tokenAmt)
        public
        view
        returns (uint256)
    {
        uint256 depositEthValue = getEthValueFromTokenAmount(tokenAmt);
        uint256 poolTotalEthValue = getPoolTotalEthValue();
        return _calculateMintAmount(depositEthValue, poolTotalEthValue);
    }

    /**
     *  @dev amount of APT minted should be in same ratio to APT supply
     *       as token amount sent is to contract's token balance, i.e.:
     *
     *       mint amount / total supply (before deposit)
     *       = token amount sent / contract token balance (before deposit)
     */
    function _calculateMintAmount(
        uint256 depositEthAmount,
        uint256 totalEthAmount
    ) internal view returns (uint256) {
        uint256 totalSupply = totalSupply();

        if (totalEthAmount == 0 || totalSupply == 0) {
            return depositEthAmount.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR);
        }

        return (depositEthAmount.mul(totalSupply)).div(totalEthAmount);
    }

    /**
     * @notice Get the underlying amount represented by APT amount,
     *         deducting early withdraw fee, if applicable.
     * @dev To check if fee will be applied, use `isEarlyRedeem`.
     * @param aptAmount The amount of APT tokens
     * @return uint256 The underlyer value of the APT tokens
     */
    function getUnderlyerAmountWithFee(uint256 aptAmount)
        public
        view
        returns (uint256)
    {
        uint256 redeemTokenAmt = getUnderlyerAmount(aptAmount);
        if (isEarlyRedeem()) {
            uint256 fee = redeemTokenAmt.mul(feePercentage).div(100);
            redeemTokenAmt = redeemTokenAmt.sub(fee);
        }
        return redeemTokenAmt;
    }

    /**
     * @notice Get the underlying amount represented by APT amount.
     * @param aptAmount The amount of APT tokens
     * @return uint256 The underlying value of the APT tokens
     */
    function getUnderlyerAmount(uint256 aptAmount)
        public
        view
        returns (uint256)
    {
        return getTokenAmountFromEthValue(getAPTEthValue(aptAmount));
    }

    /**
     * @notice Checks if caller will be charged early withdrawal fee.
     * @dev `lastDepositTime` is stored each time user makes a deposit, so
     *      the waiting period is restarted on each deposit.
     * @return bool "true" means the fee will apply, "false" means it won't.
     */
    function isEarlyRedeem() public view returns (bool) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp.sub(lastDepositTime[msg.sender]) < feePeriod;
    }

    /**
     * @notice Get the total ETH-denominated value (in wei) of the pool's assets,
     *         including not only its underlyer balance, but any part of deployed
     *         capital that is owed to it.
     * @return uint256
     */
    function getPoolTotalEthValue() public view virtual returns (uint256) {
        uint256 underlyerValue = getPoolUnderlyerEthValue();
        uint256 mAptValue = getDeployedEthValue();
        return underlyerValue.add(mAptValue);
    }

    /**
     * @notice Get the ETH-denominated value (in wei) of the pool's
     *         underlyer balance.
     * @return uint256
     */
    function getPoolUnderlyerEthValue() public view virtual returns (uint256) {
        return getEthValueFromTokenAmount(underlyer.balanceOf(address(this)));
    }

    /**
     * @notice Get the Eth-denominated value (in wei) of the pool's share
     *         of the deployed capital, as tracked by the mAPT token.
     * @return uint256
     */
    function getDeployedEthValue() public view virtual returns (uint256) {
        return mApt.getDeployedEthValue(address(this));
    }

    function getAPTEthValue(uint256 amount) public view returns (uint256) {
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        return (amount.mul(getPoolTotalEthValue())).div(totalSupply());
    }

    function getEthValueFromTokenAmount(uint256 amount)
        public
        view
        returns (uint256)
    {
        if (amount == 0) {
            return 0;
        }
        uint256 decimals = underlyer.decimals();
        return ((getTokenEthPrice()).mul(amount)).div(10**decimals);
    }

    function getTokenAmountFromEthValue(uint256 ethValue)
        public
        view
        returns (uint256)
    {
        uint256 tokenEthPrice = getTokenEthPrice();
        uint256 decimals = underlyer.decimals();
        return ((10**decimals).mul(ethValue)).div(tokenEthPrice);
    }

    function getTokenEthPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceAgg.latestRoundData();
        require(price > 0, "UNABLE_TO_RETRIEVE_ETH_PRICE");
        return uint256(price);
    }

    function getReserveTopUpAmount() public view returns (int256) {
        require(
            underlyer.balanceOf(address(this)) <= 2**255 - 1,
            "POOL_BALANCE_OVERFLOW"
        );
        int256 poolBalance = int256(underlyer.balanceOf(address(this)));
        return int256(0).sub(poolBalance);
    }

    /** @notice Allow `delegate` to withdraw any amount from the pool.
     *  @dev Will fail if called twice, due to usage of `safeApprove`.
     *  @param delegate Address to give infinite allowance to
     */
    function infiniteApprove(address delegate)
        external
        nonReentrant
        whenNotPaused
        onlyOwner
    {
        underlyer.safeApprove(delegate, type(uint256).max);
    }

    /** @notice Revoke given allowance from `delegate`.
     *  @dev Can be called even when the pool is locked.
     *  @param delegate Address to remove allowance from
     */
    function revokeApprove(address delegate) external nonReentrant onlyOwner {
        underlyer.safeApprove(delegate, 0);
    }

    /**
     * @dev This hook is in-place to block inter-user APT transfers, as it
     *      is one avenue that can be used by arbitrageurs to drain the
     *      reserves.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);
        // allow minting and burning
        if (from == address(0) || to == address(0)) return;
        // block transfer between users
        revert("INVALID_TRANSFER");
    }
}
