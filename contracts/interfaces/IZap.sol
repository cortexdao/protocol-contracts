// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IZap {
    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external;

    // LP token amount
    function unwindLiquidity(uint256 amount) external;

    // solhint-disable-next-line func-name-mixedcase
    function NAME() external view returns (string memory);

    // Order of token amounts
    function sortedSymbols() external view returns (string[] memory);

    // Asset allocation contracts required for the strategy
    function assetAllocations() external view returns (address[] memory);

    // ERC20 asset allocation tokens required for the strategy
    function erc20Allocations() external view returns (address[] memory);
}
