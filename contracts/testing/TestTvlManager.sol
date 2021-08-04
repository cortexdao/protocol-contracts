// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {TvlManagerV2} from "../TvlManagerV2.sol";
import {IAssetAllocation} from "../interfaces/IAssetAllocation.sol";

contract TestTvlManager is TvlManagerV2 {
    constructor(address addressRegistry_, address erc20Allocation_)
        public
        TvlManagerV2(addressRegistry_, erc20Allocation_)
    {} // solhint-disable-line no-empty-blocks

    function testEncodeAssetAllocationId(
        address assetAllocation,
        uint8 tokenIndex
    ) external pure returns (bytes32) {
        return _encodeAssetAllocationId(assetAllocation, tokenIndex);
    }

    function testDecodeAssetAllocationId(bytes32 id)
        external
        pure
        returns (address, uint8)
    {
        return _decodeAssetAllocationId(id);
    }

    function testGetAssetAllocationIdCount(
        IAssetAllocation[] memory allocations
    ) external view returns (uint256) {
        return _getAssetAllocationIdCount(allocations);
    }

    function testGetAssetAllocationIds(IAssetAllocation[] memory allocations)
        external
        view
        returns (bytes32[] memory)
    {
        return _getAssetAllocationsIds(allocations);
    }

    function testGetAssetAllocations()
        external
        view
        returns (IAssetAllocation[] memory)
    {
        return _getAssetAllocations();
    }
}
