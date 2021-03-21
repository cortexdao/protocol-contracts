// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

/**
 * @title Interface for addition and removal of asset allocations
          for account deployments
 * @author APY.Finance
 * @notice These functions enable external systems to pull necessary info
 *         to compute the TVL of the APY.Finance system.
 */
interface ITVLManager {
    // struct representing an execution against a contract given bytes
    // target is the garget contract to execute view calls agaisnt
    // bytes data represents the encoded function signature + parameters
    struct Data {
        address target;
        bytes data;
    }

    struct AssetAllocation {
        bytes32 sequenceId;
        string symbol;
        uint256 decimals;
        Data data;
    }

    function addAssetAllocation(
        Data calldata data,
        string calldata symbol,
        uint256 decimals
    ) external;

    function removeAssetAllocation(Data calldata data) external;

    function generateDataHash(Data calldata data)
        external
        pure
        returns (bytes32);

    function isAssetAllocationRegistered(Data calldata data)
        external
        view
        returns (bool);
}
