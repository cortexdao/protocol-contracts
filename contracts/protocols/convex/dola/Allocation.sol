// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    MetaPoolAllocationBaseV3
} from "contracts/protocols/convex/metapool/Imports.sol";

import {ConvexDolaConstants} from "./Constants.sol";

contract ConvexDolaAllocation is MetaPoolAllocationBaseV3, ConvexDolaConstants {
    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        return
            super.getUnderlyerBalance(
                account,
                META_POOL,
                REWARD_CONTRACT,
                LP_TOKEN,
                uint256(tokenIndex)
            );
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        return _getBasePoolTokenData();
    }
}
