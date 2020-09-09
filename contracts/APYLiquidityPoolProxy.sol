// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {
    OwnableUpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import {
    ReentrancyGuardUpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import {
    Initializable
} from "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {
    ERC20UpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import {
    SafeMath
} from "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import {FixedPoint} from "solidity-fixedpoint/contracts/FixedPoint.sol";
import {APT} from "./APT.sol";
import {ILiquidityPool} from "./ILiquidityPool.sol";


contract APYLiquidityPoolProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _admin)
        public
        TransparentUpgradeableProxy(_logic, _admin, getInitializerCallData())
    {} // solhint-disable no-empty-blocks

    function upgradeWithInitialize(address newImplementation)
        external
        payable
        ifAdmin
    {
        _upgradeTo(newImplementation);
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = newImplementation.delegatecall(
            getInitializerCallData()
        );
        require(success, "PoolProxy/init-failed");
    }

    function getInitializerCallData() public pure returns (bytes memory) {
        bytes memory _data = abi.encodeWithSignature("initialize()");
        return _data;
    }
}


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

    IERC20 internal _underlyer;

    event DepositedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount
    );
    event RedeemedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount
    );

    function initialize() public initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __ERC20_init_unchained("APY Pool Token", "APT");
    }

    receive() external payable {
        revert("Pool/cannot-accept-eth");
    }

    /**
     * @notice Mint corresponding amount of APT tokens for sent token amount.
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity(uint256 amount) external override nonReentrant {
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

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount) external override nonReentrant {
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

    /// @dev called by admin during deployment
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
