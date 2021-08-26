// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IAssetAllocation} from "./IAssetAllocation.sol";

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

    function isAssetAllocationRegistered(
        IAssetAllocation[] calldata assetAllocations
    ) external view returns (bool);

    function getAssetAllocation(string calldata name)
        external
        view
        returns (IAssetAllocation);
}
