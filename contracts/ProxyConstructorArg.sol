// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @dev Temporary deployment helper used to deploy APYAddressRegistry
 * and APYManager.  The single function here encodes calldata to
 * be used during initialization of the implementation logic
 * portion of the proxy contract's storage layout.
 *
 * This was done to avoid possible issues with encoding through
 * javascript libraries, as the address set during `initialize`
 * has the ability to initialize future upgrades.
 */
contract ProxyConstructorArg {
    function getEncodedArg(address proxyAdmin)
        external
        pure
        returns (bytes memory)
    {
        bytes memory payload =
            abi.encodeWithSignature("initialize(address)", proxyAdmin);
        return payload;
    }
}
