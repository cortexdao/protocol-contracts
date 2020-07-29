pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {FixedPoint} from "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {APT} from "./APT.sol";

contract APYLiquidityPool is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    uint256 private constant _DEFAULT_TOKEN_TO_ETH_FACTOR = 1000;
    uint112 private constant _MAX_UINT112 = uint112(-1);

    APT public apt; // APT token

    event MintAPT(address sender, uint256 tokenAmount, uint256 ethAmount);

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /**
     * @notice Mint corresponding amount of APT tokens for sent ETH value
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function mint() external payable nonReentrant {
        require(msg.value > 0, "Pool/insufficient-value");

        uint256 totalValue = address(this).balance.sub(msg.value);
        uint256 mintAmount = _calculateMintAmount(msg.value, totalValue);
        // _mint(msg.sender, mintAmount);

        // emit MintAPT(msg.sender, mintAmount, msg.value);
    }

    /**
     * @notice Redeems an amount of APT tokens for its ETH value
     * @param amount The amount of APT tokens to redeem
     */
    function redeem(uint256 amount) external nonReentrant {
        require(amount > 0, "Pool/insufficient-balance");
        require(
            amount <= apt.balanceOf(msg.sender),
            "Pool/insufficient-balance"
        );

        require(amount <= _MAX_UINT112, "Pool/overflow");
        require(apt.totalSupply() > 0, "Pool/divide-by-zero");
        require(apt.totalSupply() <= _MAX_UINT112, "Pool/overflow");

        FixedPoint.uq112x112 memory shareOfAPT = _shareOfAPT(amount);
        apt.burn(msg.sender, amount);

        require(address(this).balance <= _MAX_UINT112, "Pool/overflow");
        uint256 amountETH = shareOfAPT
            .mul(uint112(address(this).balance))
            .decode144();

        msg.sender.transfer(amountETH);
    }

    function burn(uint256 tokensToBurn) external nonReentrant {
        require(tokensToBurn > 0, "Must burn tokens");
        require(
            apt.balanceOf(msg.sender) >= tokensToBurn,
            "Insufficient balance"
        );

        apt.burn(msg.sender, tokensToBurn);
    }

    // called by admin on deployment
    function setTokenContract(address tokenAddress) public onlyOwner {
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
    function getAPTValue(uint256 amount) public view returns (uint256) {
        require(amount > 0, "Pool/insufficient-balance");
        require(amount <= _MAX_UINT112, "Pool/overflow");
        require(apt.totalSupply() > 0, "Pool/divide-by-zero");
        require(apt.totalSupply() <= _MAX_UINT112, "Pool/overflow");

        FixedPoint.uq112x112 memory shareOfDALP = FixedPoint.fraction(
            uint112(amount),
            uint112(apt.totalSupply())
        );

        uint256 totalValue = address(this).balance;
        require(totalValue <= _MAX_UINT112, "Pool/overflow");

        return shareOfDALP.mul(uint112(totalValue)).decode144();
    }

    function _shareOfAPT(uint256 amount)
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

    function _calculateMintAmount(uint256 ethValue, uint256 totalValue)
        private
        view
        returns (uint256)
    {
        uint256 totalSupply = apt.totalSupply();

        if (totalValue == 0 || totalSupply == 0) {
            return ethValue * _DEFAULT_TOKEN_TO_ETH_FACTOR;
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
}
