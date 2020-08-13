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
import {FixedPoint} from "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import {APT} from "./APT.sol";

contract APYLiquidityPool is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    uint256 internal constant _DEFAULT_TOKEN_TO_ETH_FACTOR = 1000;
    uint112 internal constant _MAX_UINT112 = uint112(-1);

    APT public apt; // APT token

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

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /**
     * @notice Mint corresponding amount of APT tokens for sent ETH value
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity() external payable nonReentrant {
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
    function redeem(uint256 tokenAmount) external nonReentrant {
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

    // called by admin on deployment
    function setTokenAddress(address tokenAddress) public onlyOwner {
        apt = APT(tokenAddress);
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
     * @return The total ETH value of the APT tokens
     */
    function getEthValue(uint256 amount) public view returns (uint256) {
        FixedPoint.uq112x112 memory shareOfAPT = _getShareOfAPT(amount);

        uint256 totalValue = address(this).balance;
        require(totalValue <= _MAX_UINT112, "Pool/overflow");

        return shareOfAPT.mul(uint112(totalValue)).decode144();
    }

    // minted amount should be in the same ratio to total token supply as
    // ETH sent is to contract's ETH balance, i.e.:
    //         mint amount / total supply (before deposit)
    //         = eth value sent / total eth value (before deposit)
    function _calculateMintAmount(uint256 ethValue, uint256 totalValue)
        internal
        view
        returns (uint256)
    {
        uint256 totalSupply = apt.totalSupply();

        if (totalValue == 0 || totalSupply == 0) {
            return ethValue.mul(_DEFAULT_TOKEN_TO_ETH_FACTOR);
        }

        require(ethValue <= _MAX_UINT112, "Pool/overflow");
        require(totalValue <= _MAX_UINT112, "Pool/overflow");
        require(totalSupply <= _MAX_UINT112, "Pool/overflow");

        return
            FixedPoint
                .fraction(uint112(ethValue), uint112(totalValue))
                .mul(uint112(totalSupply))
                .decode144();
    }

    function _getShareOfAPT(uint256 amount)
        internal
        view
        returns (FixedPoint.uq112x112 memory)
    {
        require(amount <= _MAX_UINT112, "Pool/overflow");
        require(apt.totalSupply() > 0, "Pool/divide-by-zero");
        require(apt.totalSupply() <= _MAX_UINT112, "Pool/overflow");

        FixedPoint.uq112x112 memory shareOfAPT = FixedPoint.fraction(
            uint112(amount),
            uint112(apt.totalSupply())
        );
        return shareOfAPT;
    }
}

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
