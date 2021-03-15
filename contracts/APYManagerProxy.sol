// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";

contract APYManagerProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address _proxyAdmin,
        address _mApt,
        address _allocationRegistry,
        address _addressRegistry
    )
        public
        TransparentUpgradeableProxy(
            _logic,
            _proxyAdmin,
            abi.encodeWithSignature(
                "initialize(address,address,address,address)",
                _proxyAdmin,
                _mApt,
                _allocationRegistry,
                _addressRegistry
            )
        )
    {} // solhint-disable no-empty-blocks
}
