pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYContractA is Ownable {
    event ExecuteAUint256(uint256 a);
    event ExecuteABytes32(bytes32 a);
    event MultiParam(uint256 a, uint256 b, uint256 c);

    function executeA(uint256 input) public returns (uint256) {
        emit ExecuteAUint256(input);
        emit ExecuteABytes32(bytes32(input));
        return input * 100;
    }

    function executeAMultiParam(
        uint256 a,
        uint256 b,
        uint256 c
    ) public {
        emit MultiParam(a, b, c);
    }
}
