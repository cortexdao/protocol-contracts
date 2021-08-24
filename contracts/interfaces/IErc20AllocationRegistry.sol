// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @title Interface to Access APY.Finance's Asset Allocations
 * @author APY.Finance
 * @notice Enables 3rd Parties (ie. Chainlink) to pull relevant asset allocations
 * in order to compute the TVL across the entire APY.Finance system.
 */
interface IErc20AllocationRegistry {
    event Erc20TokenRegistered(address token, string symbol, uint8 decimals);
    event Erc20TokenRemoved(address token);

    function registerErc20Token(address token) external;

    function registerErc20Token(address token, string calldata symbol) external;

    function registerErc20Token(
        address token,
        string calldata symbol,
        uint8 decimals
    ) external;

    function removeErc20Token(address token) external;

    function isErc20TokenRegistered(address token) external view returns (bool);

    function isErc20TokenRegistered(address[] calldata tokens)
        external
        view
        returns (bool);
}
