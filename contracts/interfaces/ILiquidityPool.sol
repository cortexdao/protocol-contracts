// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

interface ILiquidityPool {
    event DepositedAPT(
        address indexed sender,
        IERC20 token,
        uint256 tokenAmount,
        uint256 aptMintAmount,
        uint256 tokenEthValue,
        uint256 totalEthValueLocked
    );
    event RedeemedAPT(
        address indexed sender,
        IERC20 token,
        uint256 redeemedTokenAmount,
        uint256 aptRedeemAmount,
        uint256 tokenEthValue,
        uint256 totalEthValueLocked
    );
    event TokenSupported(address token, address agg);
    event TokenUnsupported(address token, address agg);
    event AddLiquidityLocked();
    event AddLiquidityUnlocked();
    event RedeemLocked();
    event RedeemUnlocked();

    function addLiquidity(uint256 amount, IERC20 token) external;

    function redeem(uint256 tokenAmount, IERC20 token) external;
}
