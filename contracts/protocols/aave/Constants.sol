// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";

abstract contract AaveConstants is INameIdentifier {
    string public constant override NAME = "aave";

    address public constant LENDING_POOL_ADDRESS =
        0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9;
}
