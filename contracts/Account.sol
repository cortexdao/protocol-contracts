// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import {
    Address as AddressNonUpgradeable
} from "@openzeppelin/contracts/utils/Address.sol";
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
    using AddressNonUpgradeable for address;

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
        genericExecutor.functionDelegateCall(data, "steps execution failed");
    }
}
