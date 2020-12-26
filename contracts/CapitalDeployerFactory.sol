// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@optionality.io/clone-factory/contracts/CloneFactory.sol";

contract CapitalDeployerFactory is Ownable, CloneFactory {
    address public libraryAddress;

    event CapitalDeployerCreated(address newThingAddress);

    constructor(address _libraryAddress) public {
        libraryAddress = _libraryAddress;
    }

    function setLibraryAddress(address _libraryAddress) public onlyOwner {
        libraryAddress = _libraryAddress;
    }

    function create(string id, address executor) public onlyOwner {
        address clone = createClone(libraryAddress);
        CapitalDeployer(clone).initialize(id, executor);
        emit CapitalDeployerCreated(clone);
    }
}
