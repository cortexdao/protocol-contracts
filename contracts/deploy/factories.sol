// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Ownable} from "contracts/common/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";
import {MetaPoolTokenProxy} from "contracts/mapt/MetaPoolTokenProxy.sol";
import {PoolToken} from "contracts/pool/PoolToken.sol";
import {PoolTokenProxy} from "contracts/pool/PoolTokenProxy.sol";
import {PoolTokenV2} from "contracts/pool/PoolTokenV2.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {Erc20Allocation} from "contracts/tvl/Erc20Allocation.sol";
import {TvlManager} from "contracts/tvl/TvlManager.sol";
import {OracleAdapter} from "contracts/oracle/OracleAdapter.sol";
import {
    ProxyAdmin,
    TransparentUpgradeableProxy
} from "contracts/proxy/Imports.sol";

import {DeploymentConstants} from "./constants.sol";

contract MetaPoolTokenFactory {
    address public addressRegistry;
    address public proxyAdminFactory;

    constructor(address addressRegistry_, address proxyAdminFactory_) public {
        addressRegistry = addressRegistry_;
        proxyAdminFactory = proxyAdminFactory_;
    }

    function createWithProxyAdmin(address newOwner) external returns (address) {
        address proxyAdmin =
            ProxyAdminFactory(proxyAdminFactory).create(newOwner);
        return create(proxyAdmin, newOwner);
    }

    function create(address proxyAdmin, address newOwner)
        public
        returns (address)
    {
        MetaPoolToken logic = new MetaPoolToken();
        MetaPoolTokenProxy proxy =
            new MetaPoolTokenProxy(address(logic), proxyAdmin, addressRegistry);

        Ownable(address(logic)).transferOwnership(newOwner);
        Ownable(address(proxy)).transferOwnership(newOwner);

        return address(proxy);
    }
}

contract PoolTokenV1Factory {
    address public addressRegistry;
    address public proxyAdminFactory;

    constructor(address addressRegistry_, address proxyAdminFactory_) public {
        addressRegistry = addressRegistry_;
        proxyAdminFactory = proxyAdminFactory_;
    }

    function createWithProxyAdmin(address tokenAddress, address newOwner)
        external
        returns (address)
    {
        address proxyAdmin =
            ProxyAdminFactory(proxyAdminFactory).create(newOwner);
        return create(proxyAdmin, tokenAddress, newOwner);
    }

    function create(
        address proxyAdmin,
        address tokenAddress,
        address newOwner
    ) public returns (address) {
        PoolToken logicV1 = new PoolToken();
        address fakeAggAddress = 0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe;
        PoolTokenProxy proxy =
            new PoolTokenProxy(
                address(logicV1),
                proxyAdmin,
                tokenAddress,
                fakeAggAddress
            );

        Ownable(address(logicV1)).transferOwnership(newOwner);
        Ownable(address(proxy)).transferOwnership(newOwner);

        return address(proxy);
    }
}

contract PoolTokenV2Factory {
    address public addressRegistry;

    constructor(address addressRegistry_) public {
        addressRegistry = addressRegistry_;
    }

    function create() external returns (address) {
        PoolTokenV2 logicV2 = new PoolTokenV2();
        return address(logicV2);
    }
}

contract OracleAdapterFactory is DeploymentConstants {
    address public addressRegistry;

    constructor(address addressRegistry_) public {
        addressRegistry = addressRegistry_;
    }

    function create() external returns (address) {
        OracleAdapter oracleAdapter =
            new OracleAdapter(
                addressRegistry,
                _tvlSource(),
                _oracleAssets(),
                _oracleSources(),
                86400,
                270
            );
        return address(oracleAdapter);
    }

    function _tvlSource() internal virtual returns (address) {
        return TVL_AGG_ADDRESS;
    }

    function _oracleAssets() internal virtual returns (address[] memory) {
        address[] memory assets = new address[](3);
        assets[0] = DAI_ADDRESS;
        assets[1] = USDC_ADDRESS;
        assets[2] = USDT_ADDRESS;
        return assets;
    }

    function _oracleSources() internal virtual returns (address[] memory) {
        address[] memory sources = new address[](3);
        sources[0] = DAI_USD_AGG_ADDRESS;
        sources[1] = USDC_USD_AGG_ADDRESS;
        sources[2] = USDT_USD_AGG_ADDRESS;
        return sources;
    }
}

contract Erc20AllocationFactory {
    address public addressRegistry;

    constructor(address addressRegistry_) public {
        addressRegistry = addressRegistry_;
    }

    function create() external returns (address) {
        Erc20Allocation erc20Allocation = new Erc20Allocation(addressRegistry);
        return address(erc20Allocation);
    }
}

contract TvlManagerFactory {
    address public addressRegistry;

    constructor(address addressRegistry_) public {
        addressRegistry = addressRegistry_;
    }

    function create() external returns (address) {
        TvlManager tvlManager = new TvlManager(addressRegistry);
        return address(tvlManager);
    }
}

contract ProxyAdminFactory {
    function create(address newOwner) external returns (address) {
        ProxyAdmin proxyAdmin = new ProxyAdmin();
        proxyAdmin.transferOwnership(newOwner);
        return address(proxyAdmin);
    }
}
