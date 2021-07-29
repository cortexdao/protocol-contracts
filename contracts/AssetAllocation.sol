// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IAssetAllocation} from "./interfaces/IAssetAllocation.sol";

abstract contract AssetAllocation is IAssetAllocation {
    address[] private _tokenAddresses;
    mapping(address => TokenData) private _tokenData;

    function tokenAddresses()
        external
        view
        override
        returns (address[] memory)
    {
        return _tokenAddresses;
    }

    function tokenData(address token)
        public
        view
        override
        returns (TokenData memory)
    {
        return _tokenData[token];
    }

    function _setupAssetAllocation(
        address token,
        string memory symbol,
        uint8 decimals
    ) internal {
        require(bytes(_tokenData[token].symbol).length != 0, "DUPLICATE_TOKEN");
        _tokenAddresses.push(token);
        _tokenData[token] = TokenData(symbol, decimals);
    }
}
