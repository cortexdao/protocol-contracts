// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";

contract APYLiquidityPoolProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _proxyAdmin)
        public
        TransparentUpgradeableProxy(
            _logic,
            _proxyAdmin,
            abi.encodeWithSignature("initialize()")
        )
    {} // solhint-disable no-empty-blocks

    function upgradeWithInitialize(address newImplementation)
        external
        payable
        ifAdmin
    {
        _upgradeTo(newImplementation);
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = newImplementation.delegatecall(
            abi.encodeWithSignature("initializeUpgrade()")
        );
        require(success, "PoolProxy/init-failed");
    }
}
