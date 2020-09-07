pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract APYStrategyGeneralExecutor is Ownable {
    using SafeERC20 for IERC20;

    struct Data {
        address target;
        bytes data;
    }

    function execute(
        IERC20 baseAsset,
        uint256 amount,
        bool deposit,
        Data[] calldata executionSteps
    ) external payable {
        // transfer funds into the contract before distributing
        if (deposit && amount > 0) {
            //TODO: Add functionality to move from pool and not msg.sender
            baseAsset.safeTransferFrom(msg.sender, address(this), amount);
        }

        for (uint256 i = 0; i < executionSteps.length; i++) {
            _call(executionSteps[i].target, executionSteps[i].data);
        }

        // on withdraw transfer funds out and to msg.sender
        if (!deposit && amount > 0) {
            baseAsset.safeTransfer(msg.sender, amount);
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
