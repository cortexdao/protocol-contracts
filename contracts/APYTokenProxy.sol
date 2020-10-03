// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";

contract APYTokenProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _proxyAdmin)
        public
        TransparentUpgradeableProxy(
            _logic,
            _proxyAdmin,
            abi.encodeWithSignature("initialize(address)", _proxyAdmin)
        )
    {} // solhint-disable no-empty-blocks
}
