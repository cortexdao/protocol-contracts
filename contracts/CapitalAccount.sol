// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

interface ICapitalAccount {
    function id() external returns (bytes32);

    function initialize(bytes32 _id) external;

    function withdraw(address payable recipient, address[] memory tokens)
        external;

    function selfDestruct(address payable recipient) external;
}

contract CapitalAccount is Ownable, ICapitalAccount {
    using SafeERC20 for IERC20;

    bytes32 public override id;

    function initialize(bytes32 _id) external override {
        if (id != 0) return;
        id = _id;
    }

    function withdraw(address payable recipient, address[] memory tokens)
        public
        override
        onlyOwner
    {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint256 balance = token.balanceOf(address(this));
            token.safeTransfer(recipient, balance);
        }
    }

    function selfDestruct(address payable recipient) public override {
        selfdestruct(recipient);
    }
}
