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

abstract contract UpgradeableContractFactory {
    function create(
        address proxyFactory,
        address proxyAdmin,
        bytes memory initData,
        address newOwner
    ) public returns (address) {
        address logic = _deployLogic();
        address proxy =
            ProxyFactory(proxyFactory).create(
                logic,
                proxyAdmin,
                initData,
                newOwner
            );
        return address(proxy);
    }

    function _deployLogic() internal virtual returns (address);
}

contract MetaPoolTokenFactory is UpgradeableContractFactory {
    function _deployLogic() internal virtual override returns (address) {
        MetaPoolToken logic = new MetaPoolToken();
        return address(logic);
    }
}

contract ProxyFactory {
    function create(
        address logic,
        address proxyAdmin,
        bytes memory initData,
        address newOwner
    ) public returns (address) {
        TransparentUpgradeableProxy proxy =
            new TransparentUpgradeableProxy(logic, proxyAdmin, initData);
        if (newOwner != address(0)) {
            Ownable(address(proxy)).transferOwnership(newOwner);
        }
        return address(proxy);
    }
}

contract PoolTokenV1Factory is UpgradeableContractFactory {
    function _deployLogic() internal virtual override returns (address) {
        PoolToken logic = new PoolToken();
        return address(logic);
    }
}

contract PoolTokenV2Factory {
    function create() external returns (address) {
        PoolTokenV2 logicV2 = new PoolTokenV2();
        return address(logicV2);
    }
}

contract OracleAdapterFactory is DeploymentConstants {
    function create(address addressRegistry) external returns (address) {
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

    function _tvlSource() internal pure returns (address) {
        return TVL_AGG_ADDRESS;
    }

    function _oracleAssets() internal pure returns (address[] memory) {
        address[] memory assets = new address[](3);
        assets[0] = DAI_ADDRESS;
        assets[1] = USDC_ADDRESS;
        assets[2] = USDT_ADDRESS;
        return assets;
    }

    function _oracleSources() internal pure returns (address[] memory) {
        address[] memory sources = new address[](3);
        sources[0] = DAI_USD_AGG_ADDRESS;
        sources[1] = USDC_USD_AGG_ADDRESS;
        sources[2] = USDT_USD_AGG_ADDRESS;
        return sources;
    }
}

contract Erc20AllocationFactory {
    function create(address addressRegistry) external returns (address) {
        Erc20Allocation erc20Allocation = new Erc20Allocation(addressRegistry);
        return address(erc20Allocation);
    }
}

contract TvlManagerFactory {
    function create(address addressRegistry) external returns (address) {
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
