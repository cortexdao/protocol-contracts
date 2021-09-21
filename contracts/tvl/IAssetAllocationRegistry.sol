// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IAssetAllocation} from "contracts/common/Imports.sol";

/**
 * @title Interface to Access APY.Finance's Asset Allocations
 * @author APY.Finance
 * @notice Enables 3rd parties, i.e. Chainlink, to pull relevant asset allocations
 * in order to compute the TVL across the entire APY.Finance system.
 */
interface IAssetAllocationRegistry {
    event AssetAllocationRegistered(IAssetAllocation assetAllocation);
    event AssetAllocationRemoved(string name);

    function registerAssetAllocation(IAssetAllocation assetAllocation) external;

    function removeAssetAllocation(string memory name) external;

    function isAssetAllocationRegistered(string[] calldata allocationNames)
        external
        view
        returns (bool);

    function getAssetAllocation(string calldata name)
        external
        view
        returns (IAssetAllocation);
}
