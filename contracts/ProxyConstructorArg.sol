// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

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
