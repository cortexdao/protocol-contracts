// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "./APYGenericExecutor.sol";

interface IStrategy {
    function initialize(address generalExecutor) external;

    function execute(bytes calldata steps) external;
}

contract Strategy is Ownable, IStrategy {
    using SafeERC20 for IERC20;

    address public generalExecutor;

    function initialize(address _generalExecutor) external override {
        if (generalExecutor != address(0)) return;
        generalExecutor = _generalExecutor;
    }

    function execute(bytes calldata steps) external override {
        bytes memory data =
            abi.encodeWithSelector(
                APYGenericExecutor(generalExecutor).execute.selector,
                steps
            );
        _delegate(generalExecutor, data, "steps execution failed");
    }

    function _delegate(
        address target,
        bytes memory data,
        string memory errorMessage
    ) private returns (bytes memory) {
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
                revert(errorMessage);
            }
        }
    }
}
