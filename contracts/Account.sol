// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAccount.sol";
import "./interfaces/IExecutor.sol";

/**
 * @title The APY Account Contract
 * @author APY.Finance
 * @notice An Account is an abstracted representation of one of multiple
 *         accounts deployed by the AccountManager that hold funds from various
 *         yield-farming protocols.
 * @dev Deployed by AccountManager and delegate calls to GenericExecutor
 */
contract Account is Ownable, IAccount {
    address public genericExecutor;

    /// @notice Constructor
    /// @param _genericExecutor the generic executor all delegatecalls will be forwarded to
    constructor(address _genericExecutor) public {
        genericExecutor = _genericExecutor;
    }

    /// @notice Executes the steps array in sequence
    /// @dev only callable by the deployer AccountManager.sol
    /// @param steps an array of GenericExecutor.Data that will be executed in order
    function execute(IExecutor.Data[] memory steps)
        external
        override
        onlyOwner
    {
        bytes memory data =
            abi.encodeWithSelector(
                IExecutor(genericExecutor).execute.selector,
                steps
            );
        _delegate(genericExecutor, data, "steps execution failed");
    }

    /// @notice performs a delegate call against the genericExecutor
    /// @param target the contract to delegate call to
    /// @param data the execution steps to execute within the generic executor
    /// @param errorMessage the error message to return if the delegate call fails
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
