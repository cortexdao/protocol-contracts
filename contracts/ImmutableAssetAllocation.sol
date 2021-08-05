// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {AssetAllocationBase} from "./AssetAllocationBase.sol";

abstract contract ImmutableAssetAllocation is AssetAllocationBase {
    using Address for address;

    TokenData[] private _tokens;

    constructor(TokenData[] memory tokens) public {
        _validateTokens(tokens);
        for (uint256 i = 0; i < tokens.length; i++) {
            _setupToken(tokens[i]);
        }
    }

    function tokens() public view override returns (TokenData[] memory) {
        return _tokens;
    }

    // solhint-disable-next-line no-empty-blocks
    function _beforeSetupToken(TokenData memory token) internal virtual {}

    // solhint-disable-next-line no-empty-blocks
    function _afterSetupToken(TokenData memory token) internal virtual {}

    function _validateTokens(TokenData[] memory tokens_) internal {
        // length restriction due to encoding logic for allocation IDs
        require(tokens_.length < type(uint8).max, "TOO_MANY_TOKENS");
        for (uint256 i = 0; i < tokens_.length; i++) {
            address token = tokens_[i].token;
            string memory symbol = tokens_[i].symbol;
            require(token.isContract(), "INVALID_ADDRESS");
            require(bytes(symbol).length != 0, "INVALID_SYMBOL");
        }
        // TODO: check for duplicate tokens
    }

    /**
     * @dev This function should only be called in the constructor
     */
    function _setupToken(TokenData memory token) private {
        _beforeSetupToken(token);
        _tokens.push(token);
        _afterSetupToken(token);
    }
}
