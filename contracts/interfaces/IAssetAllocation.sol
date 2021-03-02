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
     * @notice Returns the list of identifiers used by the other functions
     *         to pull asset info.
     *
     *         Each identifier represents a token and information on
     *         how it is placed within the system.
     *
     *         Note that the list has no duplicates, but a token may have
     *         multiplier identifiers since it may be placed in different
     *         parts of the system.
     *
     * @dev Identifiers are added during strategy deployments.
     * @return List of identifiers
     */
    function getSequenceIds() external view returns (bytes32[] memory);

    /**
     * @notice Returns the balance represented by the identifier, i.e.
     *         the token balance held in a specific part of the system.
     * @dev The balance may be aggregated from multiple contracts holding
     *      the token and also may result from a series of calculations.
     * @param sequenceId identifier for a token placed in the system
     * @return token balance represented by the identifer
     */
    function balanceOf(bytes32 sequenceId) external view returns (uint256);

    /**
     * @notice Returns the symbol of the token represented by the identifier.
     * @param sequenceId identifier for a token placed in the system
     * @return the token symbol
     */
    function symbolOf(bytes32 sequenceId) external view returns (string memory);
}
