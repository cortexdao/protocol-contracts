// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import "solidity-fixedpoint/contracts/FixedPoint.sol";
import "./ILiquidityPool.sol";

contract APYLiquidityPoolImplementation is
    ILiquidityPool,
    Initializable,
    OwnableUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    ERC20UpgradeSafe
{
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_APT_TO_UNDERLYER_FACTOR = 1000;
    uint192 internal constant _MAX_UINT192 = uint192(-1);

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address internal _admin;
    bool internal _addLiquidityLocked;
    bool internal _redeemLocked;
    IERC20 internal _underlyer;
    /* ------------------------------- */

    /** @dev Emitted when pool is (un)locked by `owner` */
    event PoolLocked(address owner);
    event PoolUnlocked(address owner);

    /** @dev Emitted when `addLiquidity` is (un)locked by `owner` */
    event AddLiquidityLocked(address owner);
    event AddLiquidityUnlocked(address owner);

    /** @dev Emitted when `redeem` is (un)locked by `owner` */
    event RedeemLocked(address owner);
    event RedeemUnlocked(address owner);

    function initialize() public initializer {
        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY Pool Token", "APT");

        // initialize impl-specific storage
        _addLiquidityLocked = false;
        _redeemLocked = false;
        // _admin and _underlyer will get set by deployer
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() public virtual onlyAdmin {}

    modifier onlyAdmin {
        require(msg.sender == _admin, "Pool/access-error");
        _;
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        _admin = adminAddress;
    }

    function lock() external onlyOwner {
        _pause();
        emit PoolLocked(msg.sender);
    }

    function unlock() external onlyOwner {
        _unpause();
        emit PoolUnlocked(msg.sender);
    }

    receive() external payable {
        revert("Pool/cannot-accept-eth");
    }

    /**
     * @notice Mint corresponding amount of APT tokens for sent token amount.
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity(uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(!_addLiquidityLocked, "Pool/access-lock");
        require(amount > 0, "Pool/insufficient-value");
        require(
            _underlyer.allowance(msg.sender, address(this)) >= amount,
            "Pool/need-allowance"
        );
        uint256 totalAmount = _underlyer.balanceOf(address(this));
        uint256 mintAmount = _calculateMintAmount(amount, totalAmount);

        _mint(msg.sender, mintAmount);
        _underlyer.transferFrom(msg.sender, address(this), amount);

        emit DepositedAPT(msg.sender, mintAmount, amount);
    }

    function lockAddLiquidity() external onlyOwner {
        _addLiquidityLocked = true;
        emit AddLiquidityLocked(msg.sender);
    }

    function unlockAddLiquidity() external onlyOwner {
        _addLiquidityLocked = false;
        emit AddLiquidityUnlocked(msg.sender);
    }

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount)
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(!_redeemLocked, "Pool/access-lock");
        require(aptAmount > 0, "Pool/redeem-positive-amount");
        require(
            aptAmount <= balanceOf(msg.sender),
            "Pool/insufficient-balance"
        );

        uint256 underlyerAmount = getUnderlyerAmount(aptAmount);

        _burn(msg.sender, aptAmount);
        _underlyer.transfer(msg.sender, underlyerAmount);

        emit RedeemedAPT(msg.sender, aptAmount, underlyerAmount);
    }

    function lockRedeem() external onlyOwner {
        _redeemLocked = true;
        emit RedeemLocked(msg.sender);
    }

    function unlockRedeem() external onlyOwner {
        _redeemLocked = false;
        emit RedeemUnlocked(msg.sender);
    }

    /// @dev called during deployment
    function setUnderlyerAddress(address underlyerAddress) public onlyOwner {
        _underlyer = IERC20(underlyerAddress);
    }

    function calculateMintAmount(uint256 underlyerAmount)
        public
        view
        returns (uint256)
    {
        uint256 underlyerTotal = _underlyer.balanceOf(address(this));
        return _calculateMintAmount(underlyerAmount, underlyerTotal);
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
        if (aptAmount == 0) return 0;

        FixedPoint.uq192x64 memory shareOfAPT = _getShareOfAPT(aptAmount);

        uint256 underlyerTotal = _underlyer.balanceOf(address(this));
        require(underlyerTotal <= _MAX_UINT192, "Pool/overflow");

        return shareOfAPT.mul(uint192(underlyerTotal)).decode();
    }

    /**
     *  @notice amount of APT minted should be in same ratio to APT supply
     *          as token amount sent is to contract's token balance, i.e.:
     *
     *          mint amount / total supply (before deposit)
     *          = token amount sent / contract token balance (before deposit)
     */
    function _calculateMintAmount(uint256 amount, uint256 totalAmount)
        internal
        view
        returns (uint256)
    {
        uint256 totalSupply = totalSupply();

        if (totalAmount == 0 || totalSupply == 0) {
            return amount.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR);
        }

        require(amount <= _MAX_UINT192, "Pool/overflow");
        require(totalAmount <= _MAX_UINT192, "Pool/overflow");
        require(totalSupply <= _MAX_UINT192, "Pool/overflow");

        return
            FixedPoint
                .fraction(uint192(amount), uint192(totalAmount))
                .mul(uint192(totalSupply))
                .decode();
    }

    function _getShareOfAPT(uint256 amount)
        internal
        view
        returns (FixedPoint.uq192x64 memory)
    {
        require(amount <= _MAX_UINT192, "Pool/overflow");
        require(totalSupply() > 0, "Pool/divide-by-zero");
        require(totalSupply() <= _MAX_UINT192, "Pool/overflow");

        FixedPoint.uq192x64 memory shareOfAPT = FixedPoint.fraction(
            uint192(amount),
            uint192(totalSupply())
        );
        return shareOfAPT;
    }
}

/**
 * @dev Proxy contract to test internal variables and functions
 *      Should not be used other than in test files!
 */
contract APYLiquidityPoolImplTestProxy is APYLiquidityPoolImplementation {
    function internalMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function internalBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function internalCalculateMintAmount(uint256 ethValue, uint256 totalValue)
        public
        view
        returns (uint256)
    {
        return
            APYLiquidityPoolImplementation._calculateMintAmount(
                ethValue,
                totalValue
            );
    }
}
