pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYContractA is Ownable {
    event MultiParam(uint256 a, uint256 b, uint256 c);

    function executeAMultiParam(
        uint256 a,
        uint256 b,
        uint256 c
    ) public {
        emit MultiParam(a, b, c);
    }

    function executeA(uint256 input) public pure returns (uint256) {
        return input * 100;
    }
}
