// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Contract that generically executes functions given a target contract to execute against
 * @author APY.Finance
 * @notice This contract is delegate called to by an APYAccount.sol when executing sequences
 */
contract APYGenericExecutor is Ownable {
    // struct representing an execution against a contracts given bytes data
    // target is the target contract to execute against
    // bytes data representing the encoded function signature + parameters
    struct Data {
        address target;
        bytes data;
    }

    /**
     * @notice Given a Data struct with a target and bytes sequence data, executes the method on the target contract
     * @param executionSteps Data struct containing the target address to execute against and the bytes data to execute
     * @dev Given the generic functionality of this contract, only owner can call this method to prevent situations where
     *      malicious actors from causing this contract to self destruct by delegating to another contract
     */
    function execute(Data[] calldata executionSteps)
        external
        payable
        onlyOwner
    {
        bytes memory returnData;
        for (uint256 i = 0; i < executionSteps.length; i++) {
            returnData = _call(
                executionSteps[i].target,
                executionSteps[i].data
            );
        }
    }

    /**
     * @notice performs a call() against a target contract
     * @param target the bytes data will be executed against
     * @param data the bytes data representing the encoded function signature + parameters
     * @return returns bytes memory represneting the returned data from the target.call()
     * @dev will bubble up revert messages
     */
    function _call(address target, bytes memory data)
        private
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = target.call(data);
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
                revert("CALL_FAILED");
            }
        }
    }
}
