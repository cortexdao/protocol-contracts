// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAccount.sol";
import "./interfaces/IExecutor.sol";

/// @title APY account represents one of many accounts APYManager.sol can deploy
/// @author APY.Finance
/// @notice The APYAccount is an abstracted representation of one of many accounts deployed by the APYManager that hold funds in various defi protocols that are earning yield
/// @dev Deployed by APYManager and delegate calls to APYGenericExecutor

contract APYAccount is Ownable, IAccount {
    address public generalExecutor;

    /// @notice Constructor
    /// @param _generalExecutor the general executor all delegatecalls will be forwarded to
    constructor(address _generalExecutor) public {
        generalExecutor = _generalExecutor;
    }

    /// @notice Executes the steps array in sequence
    /// @dev only callable by the deployer APYManager.sol
    /// @param steps an array of APYGenericExecutor.Data that will be executed in order
    function execute(IExecutor.Data[] memory steps)
        external
        override
        onlyOwner
    {
        bytes memory data =
            abi.encodeWithSelector(
                IExecutor(generalExecutor).execute.selector,
                steps
            );
        _delegate(generalExecutor, data, "steps execution failed");
    }

    /// @notice performs a delegate call against the generalExecutor
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
