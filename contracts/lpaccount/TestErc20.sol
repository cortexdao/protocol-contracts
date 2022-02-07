// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestErc20 is ERC20 {
    constructor(string memory name, string memory symbol)
        public
        ERC20(name, symbol)
    {
        _mint(msg.sender, 100e6 ether);
    }
}
