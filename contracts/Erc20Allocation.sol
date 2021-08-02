// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {EnumerableSet} from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {AssetAllocationBase} from "./AssetAllocationBase.sol";
import {IDetailedERC20} from "./interfaces/IDetailedERC20.sol";

contract Erc20Allocation is AssetAllocationBase {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _tokenAddresses;
    mapping(address => TokenData) private _tokenToData;

    function addToken(address token) external {
        string memory symbol = IDetailedERC20(token).symbol();
        uint8 decimals = IDetailedERC20(token).decimals();
        addToken(token, symbol, decimals);
    }

    function addToken(address token, string memory symbol) external {
        uint8 decimals = IDetailedERC20(token).decimals();
        addToken(token, symbol, decimals);
    }

    function addToken(
        address token,
        string memory symbol,
        uint8 decimals
    ) public {
        _tokenAddresses.add(token);
        _tokenToData[token] = TokenData(token, symbol, decimals);
    }

    function removeToken(address token) external {
        _tokenAddresses.remove(token);
        delete _tokenToData[token];
    }

    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        override
        returns (uint256)
    {
        address token = addressOf(tokenIndex);
        return IDetailedERC20(token).balanceOf(account);
    }

    function tokens() public view override returns (TokenData[] memory) {
        TokenData[] memory _tokens = new TokenData[](_tokenAddresses.length());
        for (uint256 i = 0; i < _tokens.length; i++) {
            address tokenAddress = _tokenAddresses.at(i);
            _tokens[i] = _tokenToData[tokenAddress];
        }
        return _tokens;
    }
}
