// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";

abstract contract AaveConstants is INameIdentifier {
    string public constant override NAME = "aave";

    address public constant LENDING_POOL_ADDRESS =
        0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9;

    address public constant AAVE_ADDRESS =
        0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9;
    address public constant STAKED_AAVE_ADDRESS =
        0x4da27a545c0c5B758a6BA100e3a049001de870f5;
}
