// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";

contract APYLiquidityPoolProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address _admin)
        public
        TransparentUpgradeableProxy(_logic, _admin, getInitializerCallData())
    {} // solhint-disable no-empty-blocks

    function upgradeWithInitialize(address newImplementation)
        external
        payable
        ifAdmin
    {
        _upgradeTo(newImplementation);
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = newImplementation.delegatecall(
            getUpgradeInitializerCallData()
        );
        require(success, "PoolProxy/init-failed");
    }

    function getInitializerCallData() public pure returns (bytes memory) {
        bytes memory _data = abi.encodeWithSignature("initialize()");
        return _data;
    }

    function getUpgradeInitializerCallData()
        public
        pure
        returns (bytes memory)
    {
        bytes memory _data = abi.encodeWithSignature("initializeUpgrade()");
        return _data;
    }
}
