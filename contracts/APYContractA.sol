pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYContractA is Ownable {
    event APYcontractAExecute(uint256 data);

    function executeA(uint256 input) public {
        emit APYcontractAExecute(input);
    }
}
