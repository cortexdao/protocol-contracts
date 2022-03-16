// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {DaoToken} from "contracts/dao/DaoToken.sol";

contract TestDaoToken is DaoToken {
    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
