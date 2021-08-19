// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @title Interface to Access APY.Finance's Asset Allocations
 * @author APY.Finance
 * @notice Enables 3rd parties, i.e. Chainlink, to pull relevant asset allocations
 * in order to compute the TVL across the entire APY.Finance system.
 */
interface IAssetAllocationRegistry {
    /**
     * @notice Returns a list of all identifiers where asset allocations have been registered
     * @dev the list contains no duplicate identifiers
     * @return list of all the registered identifiers
     */
    function getAssetAllocationIds() external view returns (bytes32[] memory);

    function getAssetAllocationId(address assetAllocation, uint8 tokenIndex)
        external
        view
        returns (bytes32);

    function getAssetAllocation(bytes32 id)
        external
        view
        returns (address, uint8);

    /**
     * @notice Executes the bytes lookup data registered under an id
     * @dev The balance of an id may be aggregated from multiple contracts
     * @param allocationId the id to fetch the balance for
     * @return returns the result of the executed lookup data registered for the provided id
     */
    function balanceOf(bytes32 allocationId) external view returns (uint256);

    /**
     * @notice Returns the token symbol registered under an id
     * @param allocationId the id to fetch the token for
     * @return returns the result of the token symbol registered for the provided id
     */
    function symbolOf(bytes32 allocationId)
        external
        view
        returns (string memory);

    /**
     * @notice Returns the decimals registered under an id
     * @param allocationId the id to fetch the decimals for
     * @return returns the result of the decimal value registered for the provided id
     */
    function decimalsOf(bytes32 allocationId) external view returns (uint256);
}
