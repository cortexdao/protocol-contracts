pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYContractA is Ownable {
    event ExecuteAUint256(uint256 a);
    event ExecuteABytes32(bytes32 a);
    event MultiParam(uint256 a, uint256 b, uint256 c);
    event ExecuteAReturnArray(uint256[] a);
    event ExecuteAArrayParam(uint256 a);

    function executeA(uint256 input) external returns (uint256) {
        emit ExecuteAUint256(input);
        emit ExecuteABytes32(bytes32(input));
        return input * 100;
    }

    function executeAMultiParam(
        uint256 a,
        uint256 b,
        uint256 c
    )
        external
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        emit MultiParam(a, b, c);
        return (a, b, c);
    }

    function executeAReturnArray(uint256 a)
        external
        returns (uint256[] memory)
    {
        uint256[] memory returnArray = new uint256[](2);
        returnArray[0] = a * 10;
        returnArray[1] = a * 5;
        emit ExecuteAReturnArray(returnArray);
        return returnArray;
    }

    function executeAArrayParam(uint256 a) external returns (uint256) {
        emit ExecuteAArrayParam(a);
        return a;
    }
}
