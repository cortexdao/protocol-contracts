pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APYStrategyExecutor is Ownable {
    struct Data {
        address target;
        bytes data;
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
        for (uint256 i = 0; i < executionData.length; i++) {
            _delegate(executionData[i].target, executionData[i].data);
        }
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
