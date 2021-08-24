// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IErc20AllocationRegistry} from "./IErc20AllocationRegistry.sol";

/**
 * @title Interface to Access APY.Finance's Asset Allocations
 * @author APY.Finance
 * @notice Enables 3rd parties, i.e. Chainlink, to pull relevant asset allocations
 * in order to compute the TVL across the entire APY.Finance system.
 */
interface IAssetAllocationRegistry {
    event AssetAllocationRegistered(address assetAllocation);
    event AssetAllocationRemoved(address assetAllocation);

    function registerAssetAllocation(address assetAllocation) external;

    function removeAssetAllocation(address assetAllocation) external;

    function erc20Allocation() external returns (IErc20AllocationRegistry);

    function isAssetAllocationRegistered(address[] calldata assetAllocations)
        external
        view
        returns (bool);
}
