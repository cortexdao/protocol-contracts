// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {AssetAllocationBase} from "contracts/common/AssetAllocationBase.sol";

abstract contract ImmutableAssetAllocation is AssetAllocationBase {
    using Address for address;

    constructor() public {
        _validateTokens(_getTokenData());
    }

    function tokens() public view override returns (TokenData[] memory) {
        TokenData[] memory tokens_ = _getTokenData();
        return tokens_;
    }

    function _getTokenData() internal pure virtual returns (TokenData[] memory);

    function _validateTokens(TokenData[] memory tokens_) internal view virtual {
        // length restriction due to encoding logic for allocation IDs
        require(tokens_.length < type(uint8).max, "TOO_MANY_TOKENS");
        for (uint256 i = 0; i < tokens_.length; i++) {
            address token = tokens_[i].token;
            _validateTokenAddress(token);
            string memory symbol = tokens_[i].symbol;
            require(bytes(symbol).length != 0, "INVALID_SYMBOL");
        }
        // TODO: check for duplicate tokens
    }

    function _validateTokenAddress(address token) internal view virtual {
        require(token.isContract(), "INVALID_ADDRESS");
    }
}
