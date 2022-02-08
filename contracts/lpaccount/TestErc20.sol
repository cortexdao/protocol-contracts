// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestErc20 is ERC20 {
    struct TransferCall {
        address recipient;
        uint256 amount;
    }
    TransferCall[] private _transferCalls;

    constructor(string memory name, string memory symbol)
        public
        ERC20(name, symbol)
    {
        _mint(msg.sender, 100e6 ether);
    }

    function transfer(address recipient, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _transferCalls.push(TransferCall(recipient, amount));
        return super.transfer(recipient, amount);
    }

    function getTransferCalls() public view returns (TransferCall[] memory) {
        return _transferCalls;
    }
}
