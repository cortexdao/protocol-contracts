// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "contracts/common/Imports.sol";
import {SafeMath} from "contracts/libraries/Imports.sol";
import {ImmutableAssetAllocation} from "contracts/tvl/Imports.sol";

import {
    OldConvexAllocationBase
} from "contracts/protocols/convex/common/Imports.sol";

import {ConvexCompoundConstants} from "./Constants.sol";
import {
    Curve3poolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

import {
    CTokenInterface,
    IOldStableSwap2
} from "contracts/protocols/curve/common/interfaces/Imports.sol";

contract ConvexCompoundAllocation is
    OldConvexAllocationBase,
    ImmutableAssetAllocation,
    ConvexCompoundConstants,
    Curve3poolUnderlyerConstants
{
    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        uint256 cyBalance =
            super.getUnderlyerBalance(
                account,
                STABLE_SWAP_ADDRESS,
                REWARD_CONTRACT_ADDRESS,
                LP_TOKEN_ADDRESS,
                uint256(tokenIndex)
            );
        return unwrapBalance(cyBalance, tokenIndex);
    }

    function unwrapBalance(uint256 balance, uint8 tokenIndex)
        public
        view
        returns (uint256)
    {
        IOldStableSwap2 pool = IOldStableSwap2(STABLE_SWAP_ADDRESS);
        CTokenInterface cyToken = CTokenInterface(pool.coins(tokenIndex));
        return balance.mul(cyToken.exchangeRateStored()).div(10**uint256(18));
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](2);
        tokens[0] = TokenData(DAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(USDC_ADDRESS, "USDC", 6);
        return tokens;
    }
}
