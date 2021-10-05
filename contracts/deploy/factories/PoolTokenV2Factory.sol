// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {PoolTokenV2} from "contracts/pool/PoolTokenV2.sol";

contract PoolTokenV2Factory {
    function create() external returns (address) {
        PoolTokenV2 logicV2 = new PoolTokenV2();
        return address(logicV2);
    }
}
