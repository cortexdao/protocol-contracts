// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IAssetAllocation {
    struct TokenData {
        address token;
        string symbol;
        uint8 decimals;
    }

    function tokens() external view returns (TokenData[] memory);

    function numberOfTokens() external view returns (uint256);

    /**
     * @dev Should be implemented by child contracts.
     * @dev Should work with any token from the `tokenAddresses` list.
     */
    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        returns (uint256);

    function symbolOf(uint8 tokenIndex) external view returns (string memory);

    function decimalsOf(uint8 tokenIndex) external view returns (uint8);
}
