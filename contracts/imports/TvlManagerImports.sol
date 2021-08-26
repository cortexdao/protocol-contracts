// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IAssetAllocation} from "contracts/interfaces/IAssetAllocation.sol";
import {IErc20Allocation} from "contracts/interfaces/IErc20Allocation.sol";
import {IChainlinkRegistry} from "contracts/interfaces/IChainlinkRegistry.sol";
import {
    IAssetAllocationRegistry
} from "contracts/interfaces/IAssetAllocationRegistry.sol";

import {AssetAllocationBase} from "contracts/common/AssetAllocationBase.sol";
import {
    ImmutableAssetAllocation
} from "contracts/common/ImmutableAssetAllocation.sol";
import {Erc20AllocationConstants} from "contracts/Erc20Allocation.sol";
