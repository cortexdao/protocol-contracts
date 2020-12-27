// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ICapitalDeployer {
    function id() external returns (bytes32);

    function executor() external returns (address);

    function initialize(bytes32 _id, address _executor) external;
}

contract CapitalDeployer is Ownable, ICapitalDeployer {
    bytes32 public override id;
    address public override executor;

    address[] public inputAssets;
    address[] public outputAssets;

    function initialize(bytes32 _id, address _executor) external override {
        if (id != 0) return;
        id = _id;
        executor = _executor;
    }
}
