// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IERC20, IDetailedERC20} from "contracts/common/Imports.sol";

interface IErc20Allocation {
    event Erc20TokenRegistered(IERC20 token, string symbol, uint8 decimals);
    event Erc20TokenRemoved(IERC20 token);

    function registerErc20Token(IDetailedERC20 token) external;

    function registerErc20Token(IDetailedERC20 token, string calldata symbol)
        external;

    function registerErc20Token(
        IERC20 token,
        string calldata symbol,
        uint8 decimals
    ) external;

    function removeErc20Token(IERC20 token) external;

    function isErc20TokenRegistered(IERC20 token) external view returns (bool);

    function isErc20TokenRegistered(IERC20[] calldata tokens)
        external
        view
        returns (bool);
}
