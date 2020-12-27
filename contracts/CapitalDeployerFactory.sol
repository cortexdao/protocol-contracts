// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./CloneFactory.sol";
import "./CapitalDeployer.sol";

contract CapitalDeployerFactory is Ownable, CloneFactory {
    address public libraryAddress;

    bytes32[] public ids;
    mapping(bytes32 => ICapitalDeployer) public idToDeployer;

    mapping(bytes32 => address[]) public idToTokens;
    mapping(address => bytes32[]) public tokenToIds;

    event CapitalDeployerCreated(bytes32 id, address executor, address clone);

    constructor(address _libraryAddress) public {
        libraryAddress = _libraryAddress;
    }

    function setLibraryAddress(address _libraryAddress) public onlyOwner {
        libraryAddress = _libraryAddress;
    }

    function create(bytes32 id, address executor) public onlyOwner {
        address clone = createClone(libraryAddress);
        ICapitalDeployer deployer = ICapitalDeployer(clone);
        deployer.initialize(id, executor);
        ids.push(id);
        idToDeployer[id] = deployer;
        emit CapitalDeployerCreated(id, executor, clone);
    }

    function registerTokens(bytes32 id, address[] memory tokenAddresses)
        public
        onlyOwner
    {
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            address token = tokenAddresses[i];
            tokenToIds[token].push(id);
        }
        idToTokens[id] = tokenAddresses;
    }
}
