// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface ILpAccount {
    // delegatecall to IZap.deployLiquidity
    function deployStrategy(string calldata name, uint256[] calldata amounts)
        external;

    function unwindStrategy(string calldata name, uint256[] calldata amounts)
        external;

    function transferToPool(address pool, uint256 amount) external;

    function swap(string calldata name, uint256 amount) external;

    function claim(string calldata name) external;
}
