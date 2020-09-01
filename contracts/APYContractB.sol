pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYContractB is Ownable {
    event APYcontractBExecute(uint256 data);

    function executeB(uint256 input) public {
        emit APYcontractBExecute(input);
    }
}
