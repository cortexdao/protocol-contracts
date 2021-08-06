// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IErc20AllocationRegistry} from "./IErc20AllocationRegistry.sol";

/**
 * @title Interface for addition and removal of asset allocations
 * for account deployments
 * @author APY.Finance
 * @notice These functions enable external systems to pull necessary info
 * to compute the TVL of the APY.Finance system.
 */
interface ITvlManagerV2 {
    event AssetAllocationRegistered(address assetAllocation);
    event AssetAllocationRemoved(address assetAllocation);

    function registerAssetAllocation(address assetAllocation) external;

    function removeAssetAllocation(address assetAllocation) external;

    function erc20Allocation() external returns (IErc20AllocationRegistry);
}
