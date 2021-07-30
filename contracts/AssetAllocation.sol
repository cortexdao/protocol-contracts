// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IAssetAllocation} from "./interfaces/IAssetAllocation.sol";

abstract contract AssetAllocation is IAssetAllocation {
    TokenData[] private _tokens;

    function tokens() external view override returns (TokenData[] memory) {
        return _tokens;
    }

    function symbolOf(uint8 tokenIndex)
        external
        view
        override
        returns (string memory)
    {
        return _tokens[tokenIndex].symbol;
    }

    function decimalsOf(uint8 tokenIndex)
        external
        view
        override
        returns (uint8)
    {
        return _tokens[tokenIndex].decimals;
    }

    /**
     * @dev This function should only be called in the constructor
     * TODO: This potentially should check for dupes
     */
    function _setupAssetAllocation(
        address token,
        string memory symbol,
        uint8 decimals
    ) internal {
        require(_tokens.length < type(uint8).max, "TOO_MANY_TOKENS");
        _tokens.push(TokenData(token, symbol, decimals));
    }
}
