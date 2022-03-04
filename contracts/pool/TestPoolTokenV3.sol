// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {PoolTokenV3} from "./PoolTokenV3.sol";

/**
 * @dev Proxy contract to test internal variables and functions
 * Should not be used other than in test files!
 */
contract TestPoolTokenV3 is PoolTokenV3 {
    function testMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function testBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function testTransfer(
        address from,
        address to,
        uint256 amount
    ) public {
        testBurn(from, amount);
        testMint(to, amount);
    }

    function testGetDeployedValue() public view returns (uint256) {
        return _getDeployedValue();
    }

    function testGetPoolUnderlyerValue() public view returns (uint256) {
        return _getPoolUnderlyerValue();
    }
}
