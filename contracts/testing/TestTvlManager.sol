// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {TvlManagerV2} from "../TvlManagerV2.sol";

contract TestTvlManager is TvlManagerV2 {
    constructor(address addressRegistry_)
        public
        TvlManagerV2(addressRegistry_)
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

    function testGetAssetAllocationIdCount() external view returns (uint256) {
        return _getAssetAllocationIdCount();
    }
}
