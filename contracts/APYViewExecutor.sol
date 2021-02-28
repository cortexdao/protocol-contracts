// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

contract APYViewExecutor is Ownable {
    struct Data {
        address target;
        bytes data;
    }

    function executeView(Data[] calldata executionSteps)
        external
        view
        returns (bytes memory returnData)
    {
        for (uint256 i = 0; i < executionSteps.length; i++) {
            returnData = _staticcall(
                executionSteps[i].target,
                executionSteps[i].data
            );
        }
    }

    function _staticcall(address target, bytes memory data)
        private
        view
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = target.staticcall(data);
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
