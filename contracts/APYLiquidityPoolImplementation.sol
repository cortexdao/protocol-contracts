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
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
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
    uint192 public constant MAX_UINT192 = uint192(-1);

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public admin;
    bool public addLiquidityLock;
    bool public redeemLock;
    IERC20 public underlyer;
    mapping(IERC20 => AggregatorV3Interface) public aggregators;
    IERC20[] public tokens;

    /* ------------------------------- */

    function initialize() public initializer {
        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY Pool Token", "APT");

        // initialize impl-specific storage
        addLiquidityLock = false;
        redeemLock = false;
        // admin and underlyer will get set by deployer

        // USDT
        IERC20 tether = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);
        aggregators[tether] = AggregatorV3Interface(
            0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46
        );
        // USDC
        IERC20 usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        aggregators[usdc] = AggregatorV3Interface(
            0x986b5E1e1755e3C2440e960477f25201B0a8bbD4
        );
        // DAI
        IERC20 dai = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
        aggregators[dai] = AggregatorV3Interface(
            0x773616E4d11A78F511299002da57A0a94577F1f4
        );
        tokens.push(tether);
        tokens.push(usdc);
        tokens.push(dai);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() public virtual onlyOwner {}

    function setAdminAddress(address adminAddress) public onlyOwner {
        admin = adminAddress;
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
    function addLiquidity(uint256 amount, IERC20 token)
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(!addLiquidityLock, "LOCKED");
        require(amount > 0, "AMOUNT_INSUFFICIENT");
        require(
            address(aggregators[token]) != address(0),
            "UNRECOGNIZED_TOKEN"
        );
        require(
            token.allowance(msg.sender, address(this)) >= amount,
            "ALLOWANCE_INSUFFICIENT"
        );

        uint256 depositEthValue = getTokenEthValue(msg.sender, token);
        uint256 totalEthValue = getTotalEthValue();

        uint256 mintAmount = _calculateMintAmount(
            depositEthValue,
            totalEthValue
        );

        _mint(msg.sender, mintAmount);
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit DepositedAPT(msg.sender, mintAmount, amount);
    }

    function getTotalEthValue() public view returns (uint256) {
        uint256 totalEthValue;
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = tokens[i];
            uint256 ethValue = getTokenEthValue(address(this), token);
            totalEthValue = totalEthValue.add(ethValue);
        }
        return totalEthValue;
    }

    function getTokenEthValue(address account, IERC20 token)
        public
        view
        returns (uint256)
    {
        (int256 price, ) = getTokenEthPrice(token);
        uint256 ethValue = token.balanceOf(account).mul(uint256(price));
        return ethValue;
    }

    function getTokenEthPrice(IERC20 token)
        public
        view
        returns (int256, uint8)
    {
        AggregatorV3Interface aggregator = aggregators[token];
        (, int256 price, , , ) = aggregator.latestRoundData();
        require(price > 0, "CHAINLINK_FAILURE");

        uint8 decimals = aggregator.decimals();
        return (price, decimals);
    }

    function lockAddLiquidity() external onlyOwner {
        addLiquidityLock = true;
        emit AddLiquidityLocked();
    }

    function unlockAddLiquidity() external onlyOwner {
        addLiquidityLock = false;
        emit AddLiquidityUnlocked();
    }

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount, IERC20 token)
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(!redeemLock, "LOCKED");
        require(aptAmount > 0, "AMOUNT_INSUFFICIENT");
        require(aptAmount <= balanceOf(msg.sender), "BALANCE_INSUFFICIENT");

        uint256 underlyerAmount = getUnderlyerAmount(aptAmount);

        _burn(msg.sender, aptAmount);
        underlyer.transfer(msg.sender, underlyerAmount);

        emit RedeemedAPT(msg.sender, aptAmount, underlyerAmount);
    }

    function lockRedeem() external onlyOwner {
        redeemLock = true;
        emit RedeemLocked();
    }

    function unlockRedeem() external onlyOwner {
        redeemLock = false;
        emit RedeemUnlocked();
    }

    /// @dev called during deployment
    function setUnderlyerAddress(address underlyerAddress) public onlyOwner {
        underlyer = IERC20(underlyerAddress);
    }

    function calculateMintAmount(uint256 underlyerAmount)
        public
        view
        returns (uint256)
    {
        uint256 underlyerTotal = underlyer.balanceOf(address(this));
        return _calculateMintAmount(underlyerAmount, underlyerTotal);
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

        require(amount <= MAX_UINT192, "AMOUNT_OVERFLOW");
        require(totalAmount <= MAX_UINT192, "TOTAL_AMOUNT_OVERFLOW");
        require(totalSupply <= MAX_UINT192, "TOTAL_SUPPLY_OVERFLOW");

        return
            FixedPoint
                .fraction(uint192(amount), uint192(totalAmount))
                .mul(uint192(totalSupply))
                .decode();
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
        FixedPoint.uq192x64 memory shareOfAPT = _getShareOfAPT(aptAmount);

        uint256 underlyerTotal = underlyer.balanceOf(address(this));
        require(underlyerTotal <= MAX_UINT192, "UNDERLYER_TOTAL_OVERFLOW");

        return shareOfAPT.mul(uint192(underlyerTotal)).decode();
    }

    function _getShareOfAPT(uint256 amount)
        internal
        view
        returns (FixedPoint.uq192x64 memory)
    {
        require(amount <= MAX_UINT192, "AMOUNT_OVERFLOW");
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        require(totalSupply() <= MAX_UINT192, "TOTAL_SUPPLY_OVERFLOW");

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
// contract APYLiquidityPoolImplementationTEST is APYLiquidityPoolImplementation {
//     function mint(address account, uint256 amount) public {
//         _mint(account, amount);
//     }

//     function burn(address account, uint256 amount) public {
//         _burn(account, amount);
//     }
// }
