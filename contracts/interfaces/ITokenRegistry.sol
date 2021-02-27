// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

/**
 * @title Interface for (de)registration of tokens for strategy deployments
 * @author APY.Finance
 * @notice These functions enable Chainlink to pull necessary info
 *         to compute the TVL of the APY.Finance system.
 */
interface ITokenRegistry {
    function registerTokens(address strategy, address[] calldata tokens)
        external;

    function deregisterTokens(address strategy, address[] calldata tokens)
        external;

    function isTokenRegistered(address token) external view returns (bool);
}
