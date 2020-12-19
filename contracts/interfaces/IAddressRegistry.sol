// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

interface IAddressRegistry {
    function getIds() external view returns (bytes32[] memory);

    function getAddress(bytes32 id) external view returns (address);
}
