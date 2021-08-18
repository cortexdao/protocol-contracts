// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IZap {
    // TODO: How to associate asset allocations...

    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external;

    // LP token amount
    function unwindLiquidity(uint256 amount) external;

    // solhint-disable-next-line func-name-mixedcase
    function NAME() external view returns (string memory);

    // Order of token amounts
    function sortedSymbols() external view returns (string[] memory);
}
