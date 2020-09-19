// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";

contract APYPoolTokenProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _proxyAdmin)
        public
        TransparentUpgradeableProxy(
            _logic,
            _proxyAdmin,
            abi.encodeWithSignature("initialize()")
        )
    {} // solhint-disable no-empty-blocks
}
