// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APT is ERC20("APY Pool Token", "APT"), Ownable {
    address public manager;

    function mint(address investor, uint256 mintAmount) external onlyManager {
        _mint(investor, mintAmount);
    }

    function burn(address investor, uint256 tokensToBurn) external onlyManager {
        _burn(investor, tokensToBurn);
    }

    modifier onlyManager {
        require(msg.sender == manager, "Only manager can call");
        _;
    }

    // admin call on deployment
    function setManagerAddress(address _manager) public onlyOwner {
        manager = _manager;
    }
}
