// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {FixedPoint} from "solidity-fixedpoint/contracts/FixedPoint.sol";
import {APT} from "./APT.sol";
import {ILiquidityPool} from "./ILiquidityPool.sol";

contract APYLiquidityPool is ILiquidityPool, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    uint256 internal constant _DEFAULT_TOKEN_TO_ETH_FACTOR = 1000;
    uint192 internal constant _MAX_UINT192 = uint192(-1);

    APT public apt; // APT token
    address public manager;

    event DepositedAPT(
        address indexed sender,
        uint256 tokenAmount,
        uint256 ethValue
    );
    event RedeemedAPT(
        address indexed sender,
        uint256 tokenAmount,
        uint256 ethValue
    );
    event PoolDrained(address sender, uint256 amount);

    // solhint-disable-next-line no-empty-blocks
    receive() external override payable {}

    /**
     * @notice Mint corresponding amount of APT tokens for sent ETH value
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity() external override payable nonReentrant {
        require(msg.value > 0, "Pool/insufficient-value");

        uint256 totalValue = address(this).balance.sub(msg.value);
        uint256 mintAmount = _calculateMintAmount(msg.value, totalValue);
        apt.mint(msg.sender, mintAmount);

        emit DepositedAPT(msg.sender, mintAmount, msg.value);
    }

    /**
     * @notice Redeems an amount of APT tokens for its ETH value
     * @param tokenAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 tokenAmount) external override nonReentrant {
        require(tokenAmount > 0, "Pool/redeem-positive-amount");
        require(
            tokenAmount <= apt.balanceOf(msg.sender),
            "Pool/insufficient-balance"
        );

        uint256 ethValue = getEthValue(tokenAmount);

        apt.burn(msg.sender, tokenAmount);
        msg.sender.transfer(ethValue);

        emit RedeemedAPT(msg.sender, tokenAmount, ethValue);
    }

    /**
     * @notice Sends all ETH in the pool to the transaction sender.
     *         Should only be callable by the manager.
     */
    function drain() external override onlyManager returns (uint256) {
        uint256 unusedAmount = unused();
        msg.sender.transfer(unusedAmount);
        emit PoolDrained(msg.sender, unusedAmount);
        return unusedAmount;
    }

    /// @dev called by admin during deployment
    function setTokenAddress(address tokenAddress) public onlyOwner {
        apt = APT(tokenAddress);
    }

    /// @dev called by admin during deployment
    function setManagerAddress(address _manager) public onlyOwner {
        manager = _manager;
    }

    function calculateMintAmount(uint256 ethValue)
        public
        view
        returns (uint256)
    {
        uint256 totalValue = address(this).balance;
        return _calculateMintAmount(ethValue, totalValue);
    }

    /**
     * @notice Get the ETH value of an amount of APT tokens
     * @param amount The amount of APT tokens
     * @return uint256 The total ETH value of the APT tokens
     */
    function getEthValue(uint256 amount) public view returns (uint256) {
        FixedPoint.uq192x64 memory shareOfAPT = _getShareOfAPT(amount);

        uint256 totalValue = address(this).balance;
        require(totalValue <= _MAX_UINT192, "Pool/overflow");

        return shareOfAPT.mul(uint192(totalValue)).decode();
    }

    /**
     * @notice Returns the deposited capital not yet deployed to a strategy.
     * @return uint256 The ETH balance of the pool.
     */
    function unused() public override view returns (uint256) {
        return address(this).balance;
    }

    /**
     *  @notice minted amount should be in the same ratio to total token
     *          supply as ETH sent is to contract's ETH balance, i.e.:
     *
     *          mint amount / total supply (before deposit)
     *          = eth value sent / total eth value (before deposit)
     */
    function _calculateMintAmount(uint256 ethValue, uint256 totalValue)
        internal
        view
        returns (uint256)
    {
        uint256 totalSupply = apt.totalSupply();

        if (totalValue == 0 || totalSupply == 0) {
            return ethValue.mul(_DEFAULT_TOKEN_TO_ETH_FACTOR);
        }

        require(ethValue <= _MAX_UINT192, "Pool/overflow");
        require(totalValue <= _MAX_UINT192, "Pool/overflow");
        require(totalSupply <= _MAX_UINT192, "Pool/overflow");

        return
            FixedPoint
                .fraction(uint192(ethValue), uint192(totalValue))
                .mul(uint192(totalSupply))
                .decode();
    }

    function _getShareOfAPT(uint256 amount)
        internal
        view
        returns (FixedPoint.uq192x64 memory)
    {
        require(amount <= _MAX_UINT192, "Pool/overflow");
        require(apt.totalSupply() > 0, "Pool/divide-by-zero");
        require(apt.totalSupply() <= _MAX_UINT192, "Pool/overflow");

        FixedPoint.uq192x64 memory shareOfAPT = FixedPoint.fraction(
            uint192(amount),
            uint192(apt.totalSupply())
        );
        return shareOfAPT;
    }

    modifier onlyManager {
        require(msg.sender == manager, "Only manager can call");
        _;
    }
}

/**
 * @dev Proxy contract to test internal variables and functions
 *      Should not be used other than in test files!
 */
contract APYLiquidityPoolTestProxy is APYLiquidityPool {
    uint256 public defaultTokenToEthFactor = APYLiquidityPool
        ._DEFAULT_TOKEN_TO_ETH_FACTOR;

    function internalCalculateMintAmount(uint256 ethValue, uint256 totalValue)
        public
        view
        returns (uint256)
    {
        return APYLiquidityPool._calculateMintAmount(ethValue, totalValue);
    }
}
