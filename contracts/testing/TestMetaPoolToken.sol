// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {MetaPoolToken} from "../MetaPoolToken.sol";

/**
 * @dev Proxy contract to test internal variables and functions
 * Should not be used other than in test files!
 */
contract TestMetaPoolToken is MetaPoolToken {
    function testMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function testBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function testGetTvl() public view returns (uint256) {
        return _getTvl();
    }
}
