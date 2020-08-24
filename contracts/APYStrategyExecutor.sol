pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYStrategyExecutor is Ownable {
    struct Data {
        address target;
        bytes4 functionSelector;
        bool[] returnTypesisArray; //true if an array
        bytes32[] params; // 10, 0, 20
        uint256[] returnParam;
        //position is the position of the return data, value at position is the position in the params
    }

    mapping(address => mapping(bytes10 => bool))
        public allowedContractExecution;

    //TODO: events for adding
    //TODO: events for removing

    function registerContractExecution(
        address contractAddress,
        bytes10 functionSelector
    ) external onlyOwner {
        allowedContractExecution[contractAddress][functionSelector] = true;
    }

    function execute(Data[] calldata executionData) external payable {
        bytes memory returnData;

        for (uint256 i = 0; i < executionData.length; i++) {
            // initial running
            if (returnData.length == 0) {
                // construct params
                bytes memory functionCallData = abi.encodeWithSelector(
                    executionData[i].functionSelector,
                    executionData[i].params
                );
                // execute
                returnData = _delegate(
                    executionData[i].target,
                    functionCallData
                );
            } else {
                bytes32[] memory params = executionData[i].params;
                // extract prior values
                for (
                    uint256 pos = 0;
                    pos < executionData[i].returnTypesisArray.length;
                    pos++
                ) {
                    // not an array
                    if (executionData[i].returnTypesisArray[pos] == false) {
                        // if the type is not an array then parse it out
                        bytes32 parsedReturnData = _parseReturnData(
                            returnData,
                            pos
                        );
                        // map the pos to the new pos
                        uint256 newPos = executionData[i].returnParam[pos];
                        params[newPos] = parsedReturnData;
                    } else {
                        returnData = "";
                        //TODO:  if the type is an array do something special
                    }
                }

                // construct the params
                bytes memory functionCallData = abi.encodeWithSelector(
                    executionData[i].functionSelector,
                    params
                );

                //execute
                returnData = _delegate(
                    executionData[i].target,
                    functionCallData
                );
            }
        }
    }

    function _parseArray(bytes memory data, uint256 bytesOffset)
        internal
        pure
        returns (bytes32[] memory, uint256)
    {
        uint256 length;
        //solhint-disable-next-line no-inline-assembly
        assembly {
            length := mload(add(data, add(32, bytesOffset)))
        }

        bytes32[] memory parsedArray = new bytes32[](length);

        for (
            uint256 i = 32 + bytesOffset;
            i <= (32 * length) + bytesOffset;
            i += 32
        ) {
            //solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(add(parsedArray, i), mload(add(data, i)))
            }
        }

        return (parsedArray, length);
    }

    function _parseReturnData(bytes memory returnData, uint256 position)
        internal
        pure
        returns (bytes32)
    {
        bytes32 parsed;
        //solhint-disable-next-line no-inline-assembly
        assembly {
            //add 0 bytes to the pointer that points toward the memory address of our data variable
            parsed := mload(add(returnData, mul(position, 32)))
        }
        return parsed;
    }

    function _delegate(address target, bytes memory data)
        private
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = target.delegatecall(data);
        if (success) {
            return returndata;
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly

                // solhint-disable-next-line no-inline-assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("DELEGATECALL_FAILED");
            }
        }
    }
}
