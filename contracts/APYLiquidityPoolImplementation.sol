// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import "solidity-fixedpoint/contracts/FixedPoint.sol";
import "./APT.sol";
import "./ILiquidityPool.sol";

contract APYLiquidityPoolImplementation is
    ILiquidityPool,
    Initializable,
    OwnableUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    ERC20UpgradeSafe
{
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_APT_TO_UNDERLYER_FACTOR = 1000;
    uint192 internal constant _MAX_UINT192 = uint192(-1);

    address public admin;
    IERC20 public underlyer;

    function initialize() public initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __ERC20_init_unchained("APY Pool Token", "APT");
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() public virtual onlyAdmin {}

    modifier onlyAdmin {
        require(msg.sender == admin, "Pool/access-error");
        _;
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        admin = adminAddress;
    }

    receive() external payable {
        revert("Pool/cannot-accept-eth");
    }

    /**
     * @notice Mint corresponding amount of APT tokens for sent token amount.
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity(uint256 amount) external override nonReentrant {
        require(amount > 0, "AMOUNT_INSUFFICIENT");
        require(
            underlyer.allowance(msg.sender, address(this)) >= amount,
            "ALLOWANCE_INSUFFICIENT"
        );
        uint256 totalAmount = underlyer.balanceOf(address(this));
        uint256 mintAmount = _calculateMintAmount(amount, totalAmount);

        _mint(msg.sender, mintAmount);
        underlyer.transferFrom(msg.sender, address(this), amount);

        emit DepositedAPT(msg.sender, mintAmount, amount);
    }

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount) external override nonReentrant {
        require(aptAmount > 0, "AMOUNT_INSUFFICIENT");
        require(aptAmount <= balanceOf(msg.sender), "BALANCE_INSUFFICIENT");

        uint256 underlyerAmount = getUnderlyerAmount(aptAmount);

        _burn(msg.sender, aptAmount);
        underlyer.transfer(msg.sender, underlyerAmount);

        emit RedeemedAPT(msg.sender, aptAmount, underlyerAmount);
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

        require(amount <= _MAX_UINT192, "AMOUNT_OVERFLOW");
        require(totalAmount <= _MAX_UINT192, "TOTAL_AMOUNT_OVERFLOW");
        require(totalSupply <= _MAX_UINT192, "TOTAL_SUPPLY_OVERFLOW");

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
        require(underlyerTotal <= _MAX_UINT192, "UNDERLYER_TOTAL_OVERFLOW");

        return shareOfAPT.mul(uint192(underlyerTotal)).decode();
    }

    function _getShareOfAPT(uint256 amount)
        internal
        view
        returns (FixedPoint.uq192x64 memory)
    {
        require(amount <= _MAX_UINT192, "AMOUNT_OVERFLOW");
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        require(totalSupply() <= _MAX_UINT192, "TOTAL_SUPPLY_OVERFLOW");

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
contract APYLiquidityPoolImplementationTEST is APYLiquidityPoolImplementation {
    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}
