// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {AssetAllocation} from "../AssetAllocation.sol";

contract SimpleAssetAllocation is AssetAllocation {
    constructor(TokenData[] memory tokens) public {
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i].token;
            string memory symbol = tokens[i].symbol;
            uint8 decimals = tokens[i].decimals;
            _setupAssetAllocation(token, symbol, decimals);
        }
    }

    // solhint-disable-next-line no-unused-vars
    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        override
        returns (uint256)
    {
        return 42;
    }
}
