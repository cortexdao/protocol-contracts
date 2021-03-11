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

    function deployAccount(address generalExecutor) external returns (address);

    function isAccountDeployed(address account) external returns (bool);

    function fundAccount(
        address account,
        AccountAllocation calldata allocation,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function fundAndExecute(
        address account,
        AccountAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function execute(
        address account,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function executeAndWithdraw(
        address account,
        AccountAllocation calldata allocation,
        APYGenericExecutor.Data[] calldata steps,
        IAssetAllocationRegistry.AssetAllocation[] calldata viewData
    ) external;

    function withdrawFromAccount(
        address account,
        AccountAllocation calldata allocation
    ) external;
}
