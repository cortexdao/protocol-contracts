// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

/**
 * @title Interface to access APY.Finance's asset allocation
 * @author APY.Finance
 * @notice These functions enable Chainlink to pull necessary info
 *         to compute the TVL of the APY.Finance system.
 */
interface IAssetAllocation {
    /**
     * @notice Returns the list of asset addresses.
     * @dev Address list will be populated automatically from the set
     *      of input and output assets for each strategy.
     */
    function getSequenceIds() external view returns (bytes32[] memory);

    /**
     * @notice Returns the total balance in the system for given token.
     * @dev The balance is possibly aggregated from multiple contracts
     *      holding the token.
     */
    function balanceOf(bytes32 sequenceId) external view returns (uint256);

    /// @notice Returns the symbol of the given token.
    function symbolOf(bytes32 sequenceId) external view returns (string memory);
}
