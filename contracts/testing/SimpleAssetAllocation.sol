// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {ImmutableAssetAllocation} from "../ImmutableAssetAllocation.sol";

contract SimpleAssetAllocation is ImmutableAssetAllocation {
    constructor(TokenData[] memory tokens)
        public
        ImmutableAssetAllocation(tokens)
    {} // solhint-disable-line no-empty-blocks

    // solhint-disable-next-line
    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        override
        returns (uint256)
    {
        return 42;
    }
}
