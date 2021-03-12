// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYGenericExecutor.sol";
import "./IAssetAllocationRegistry.sol";

interface IAccountFactory {
    struct AccountAllocation {
        bytes32[] poolIds;
        uint256[] amounts;
    }

    function deployAccount(bytes32 accountId, address generalExecutor)
        external
        returns (address);

    function getAccount(bytes32 accountId) external returns (address);

    function fundAccount(
        bytes32 accountId,
        AccountAllocation calldata allocation,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function fundAndExecute(
        bytes32 accountId,
        AccountAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function execute(
        bytes32 accountId,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function executeAndWithdraw(
        bytes32 accountId,
        AccountAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function withdrawFromAccount(
        bytes32 accountId,
        AccountAllocation calldata allocation
    ) external;
}
