// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {ProxyAdmin} from "@openzeppelin/contracts/proxy/ProxyAdmin.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";


contract APYPoolAdmin is ProxyAdmin {
    TransparentUpgradeableProxy private _poolProxy;

    constructor(address payable poolProxy) public {
        _poolProxy = TransparentUpgradeableProxy(poolProxy);
    }

    function getPoolAddress() external view returns (address) {
        return address(_poolProxy);
    }

    function changePoolAdmin(address newAdmin) public onlyOwner {
        changeProxyAdmin(_poolProxy, newAdmin);
    }

    function upgradePool(address implementation) public onlyOwner {
        upgrade(_poolProxy, implementation);
    }

    function getPoolImplementationAddress() public view returns (address) {
        return getProxyImplementation(_poolProxy);
    }
}
