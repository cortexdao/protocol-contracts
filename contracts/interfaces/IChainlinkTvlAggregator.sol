// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

interface IChainlinkTvlAggregator {

    function getTokenAddresses() external view returns(address[] memory);
    function balanceOf(address token) external view returns (uint256);
    function symbolOf(address token) external view returns (string memory);
}
