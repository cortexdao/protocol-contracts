// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Asset {
    IERC20 token;
    uint256 proportion;
}

interface IStrategy {
    function name() external view returns (string memory);

    function inputAssets() external view returns (Asset[] memory);
}
