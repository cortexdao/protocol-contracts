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

    function symbolOf(address token)
        external
        view
        override
        returns (string memory)
    {
        return _tokenData[token].symbol;
    }

    function decimalsOf(address token) external view override returns (uint8) {
        return _tokenData[token].decimals;
    }

    /**
     * @dev This function should only be called in the constructor
     */
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
