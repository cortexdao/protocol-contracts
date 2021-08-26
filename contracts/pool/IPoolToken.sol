// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IDetailedERC20} from "contracts/common/Imports.sol";

interface IPoolToken {
    event DepositedAPT(
        address indexed sender,
        IDetailedERC20 token,
        uint256 tokenAmount,
        uint256 aptMintAmount,
        uint256 tokenEthValue,
        uint256 totalEthValueLocked
    );
    event RedeemedAPT(
        address indexed sender,
        IDetailedERC20 token,
        uint256 redeemedTokenAmount,
        uint256 aptRedeemAmount,
        uint256 tokenEthValue,
        uint256 totalEthValueLocked
    );

    /**
     * @notice Mint corresponding amount of APT tokens for deposited stablecoin.
     * @param amount Amount to deposit of the underlying stablecoin
     */
    function addLiquidity(uint256 amount) external;

    /**
     * @notice Redeems APT amount for its underlying stablecoin amount.
     * @param tokenAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 tokenAmount) external;

    function calculateMintAmount(uint256 depositAmount)
        external
        view
        returns (uint256);

    function getUnderlyerAmountWithFee(uint256 aptAmount)
        external
        view
        returns (uint256);

    function getUnderlyerAmount(uint256 aptAmount)
        external
        view
        returns (uint256);

    function getAPTValue(uint256 aptAmount) external view returns (uint256);
}
