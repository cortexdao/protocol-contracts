// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface ILpAccount {
    // delegatecall to IZap.deployLiquidity
    function deployStrategy(
        string calldata name,
        uint256[] calldata amounts,
        uint256 lockPeriod
    ) external;

    function unwindStrategy(
        string calldata name,
        uint256 amount,
        uint8 index,
        uint256 lockPeriod
    ) external;

    function transferToPool(address pool, uint256 amount) external;

    function swap(
        string calldata name,
        uint256 amount,
        uint256 minAmount,
        uint256 lockPeriod
    ) external;

    function claim(string calldata name, uint256 lockPeriod) external;
}
