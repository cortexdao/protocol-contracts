// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APT is ERC20("APY Pool Token", "APT"), Ownable {
    address public pool;

    function mint(address investor, uint256 mintAmount) external onlyPool {
        _mint(investor, mintAmount);
    }

    function burn(address investor, uint256 tokensToBurn) external onlyPool {
        _burn(investor, tokensToBurn);
    }

    modifier onlyPool {
        require(msg.sender == pool, "Only pool can call");
        _;
    }

    /// @dev called by admin during deployment
    function setPoolAddress(address _pool) public onlyOwner {
        pool = _pool;
    }
}
