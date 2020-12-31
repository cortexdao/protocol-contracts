// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

contract APYGenericExecutor {
    struct Data {
        address target;
        bytes data;
    }

    function execute(Data[] calldata executionSteps) external payable {
        bytes memory returnData;
        for (uint256 i = 0; i < executionSteps.length; i++) {
            returnData = _call(
                executionSteps[i].target,
                executionSteps[i].data
            );
            revert("Holy batman");
        }
    }

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
