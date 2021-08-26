// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {
    AggregatorV3Interface
} from "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import {IOracleAdapter} from "contracts/interfaces/IOracleAdapter.sol";
import {IOverrideOracle} from "contracts/interfaces/IOverrideOracle.sol";
import {ILockingOracle} from "contracts/interfaces/ILockingOracle.sol";
