// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {AssetAllocationBase} from "./AssetAllocationBase.sol";
import {
    IErc20AllocationRegistry
} from "./interfaces/IErc20AllocationRegistry.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";
import {IDetailedERC20} from "./interfaces/IDetailedERC20.sol";
import {AccessControl} from "./utils/AccessControl.sol";

contract Erc20Allocation is
    IErc20AllocationRegistry,
    AssetAllocationBase,
    AccessControl
{
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _tokenAddresses;
    mapping(address => TokenData) private _tokenToData;

    constructor(address addressRegistry_) public {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS_REGISTRY");
        IAddressRegistryV2 addressRegistry =
            IAddressRegistryV2(addressRegistry_);
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(CONTRACT_ROLE, addressRegistry.poolManagerAddress());
        _setupRole(CONTRACT_ROLE, addressRegistry.lpSafeAddress());
    }

    function registerErc20Token(address token)
        external
        override
        onlyContractRole
    {
        string memory symbol = IDetailedERC20(token).symbol();
        uint8 decimals = IDetailedERC20(token).decimals();
        _registerErc20Token(token, symbol, decimals);
    }

    function registerErc20Token(address token, string calldata symbol)
        external
        override
        onlyContractRole
    {
        uint8 decimals = IDetailedERC20(token).decimals();
        _registerErc20Token(token, symbol, decimals);
    }

    function registerErc20Token(
        address token,
        string calldata symbol,
        uint8 decimals
    ) external override onlyContractRole {
        _registerErc20Token(token, symbol, decimals);
    }

    function _registerErc20Token(
        address token,
        string memory symbol,
        uint8 decimals
    ) internal {
        require(Address.isContract(token), "INVALID_ADDRESS");
        require(bytes(symbol).length != 0, "INVALID_SYMBOL");
        _tokenAddresses.add(token);
        _tokenToData[token] = TokenData(token, symbol, decimals);
    }

    function removeErc20Token(address token)
        external
        override
        onlyContractRole
    {
        _tokenAddresses.remove(token);
        delete _tokenToData[token];
    }

    function isErc20TokenRegistered(address token)
        external
        view
        override
        returns (bool)
    {
        return _tokenAddresses.contains(token);
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
