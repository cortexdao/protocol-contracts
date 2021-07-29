// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IAssetAllocation {
    struct TokenData {
        string symbol;
        uint8 decimals;
    }

    function tokenAddresses() external view returns (address[] memory);

    /**
     * @dev Should be implemented by child contracts.
     * @dev Should work with any token from the `tokenAddresses` list.
     */
    function balanceOf(address account, address token)
        external
        view
        returns (uint256);

    function symbolOf(address token) external view returns (string memory);

    function decimalsOf(address token) external view returns (uint8);
}
