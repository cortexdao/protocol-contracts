// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IAssetAllocation {
    struct TokenData {
        string symbol;
        uint8 decimals;
    }

    function tokenData(address token) external view returns (TokenData memory);

    function tokenAddresses() external view returns (address[] memory);

    function balanceOf(address account, address token)
        external
        view
        returns (uint256);
}
