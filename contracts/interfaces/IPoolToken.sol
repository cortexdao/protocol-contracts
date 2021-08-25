// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface IPoolToken {
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
