// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Ownable} from "contracts/common/Imports.sol";
import {Address} from "contracts/libraries/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";
import {MetaPoolTokenProxy} from "contracts/mapt/MetaPoolTokenProxy.sol";
import {PoolToken} from "contracts/pool/PoolToken.sol";
import {PoolTokenProxy} from "contracts/pool/PoolTokenProxy.sol";
import {PoolTokenV2} from "contracts/pool/PoolTokenV2.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {AddressRegistryV2} from "contracts/registry/AddressRegistryV2.sol";
import {Erc20Allocation} from "contracts/tvl/Erc20Allocation.sol";
import {TvlManager} from "contracts/tvl/TvlManager.sol";
import {OracleAdapter} from "contracts/oracle/OracleAdapter.sol";
import {LpAccount} from "contracts/lpaccount/LpAccount.sol";
import {
    ProxyAdmin,
    TransparentUpgradeableProxy
} from "contracts/proxy/Imports.sol";

import {DeploymentConstants} from "./constants.sol";

abstract contract UpgradeableContractFactory {
    function create(
        ProxyFactory proxyFactory,
        address proxyAdmin,
        bytes memory initData
    ) public virtual returns (address) {
        address logic = _deployLogic(initData);
        address proxy = proxyFactory.create(logic, proxyAdmin, initData);
        return address(proxy);
    }

    /**
     * `initData` is passed to allow initialization of the logic
     * contract's storage.  This is to block possible attack vectors.
     * Future added functionality may allow those controlling the
     * contract to selfdestruct it.
     */
    function _deployLogic(bytes memory initData)
        internal
        virtual
        returns (address);
}

contract MetaPoolTokenFactory is UpgradeableContractFactory {
    using Address for address;

    function _deployLogic(bytes memory initData)
        internal
        virtual
        override
        returns (address)
    {
        MetaPoolToken logic = new MetaPoolToken();
        address _logic = address(logic);
        _logic.functionCall(initData);
        return _logic;
    }
}

contract LpAccountFactory is UpgradeableContractFactory {
    using Address for address;

    function _deployLogic(bytes memory initData)
        internal
        virtual
        override
        returns (address)
    {
        LpAccount logic = new LpAccount();
        address _logic = address(logic);
        _logic.functionCall(initData);
        return _logic;
    }
}

contract ProxyFactory {
    function create(
        address logic,
        address proxyAdmin,
        bytes memory initData
    ) public returns (address) {
        TransparentUpgradeableProxy proxy =
            new TransparentUpgradeableProxy(logic, proxyAdmin, initData);
        return address(proxy);
    }

    function createAndTransfer(
        address logic,
        address proxyAdmin,
        bytes memory initData,
        address owner
    ) public returns (address) {
        address proxy = create(logic, proxyAdmin, initData);
        Ownable(proxy).transferOwnership(owner);
        return proxy;
    }
}

contract PoolTokenV1Factory is UpgradeableContractFactory {
    using Address for address;

    address private _logic;

    function _deployLogic(bytes memory initData)
        internal
        virtual
        override
        returns (address)
    {
        if (_logic != address(0)) {
            return _logic;
        }
        PoolToken logic = new PoolToken();
        _logic = address(logic);
        _logic.functionCall(initData);
        return _logic;
    }
}

contract PoolTokenV2Factory {
    using Address for address;

    address private _logic;

    function create(
        address proxy,
        address proxyAdmin,
        bytes memory initData
    ) public {
        if (_logic != address(0)) {
            _logic = address(new PoolTokenV2());
            _logic.functionCall(initData);
        }

        ProxyAdmin(proxyAdmin).upgradeAndCall(
            TransparentUpgradeableProxy(payable(proxy)),
            _logic,
            initData
        );
    }
}

contract PoolTokenV2LogicFactory {
    function create() external returns (address) {
        PoolTokenV2 logicV2 = new PoolTokenV2();
        return address(logicV2);
    }
}

contract AddressRegistryV2LogicFactory {
    function create() external returns (address) {
        AddressRegistryV2 logicV2 = new AddressRegistryV2();
        return address(logicV2);
    }
}

contract AddressRegistryV2Factory is UpgradeableContractFactory {
    using Address for address;

    function create(
        ProxyFactory proxyFactory,
        address proxyAdmin,
        bytes memory initData
    ) public override returns (address) {
        address logic = _deployLogic(initData);
        address proxy =
            proxyFactory.createAndTransfer(
                logic,
                proxyAdmin,
                initData,
                msg.sender
            );
        return proxy;
    }

    function _deployLogic(bytes memory initData)
        internal
        virtual
        override
        returns (address)
    {
        AddressRegistryV2 logic = new AddressRegistryV2();
        address _logic = address(logic);
        _logic.functionCall(initData);
        return _logic;
    }
}

contract OracleAdapterFactory {
    function create(
        address addressRegistry,
        address tvlSource,
        address[] memory assets,
        address[] memory sources,
        uint256 aggStalePeriod,
        uint256 defaultLockPeriod
    ) public virtual returns (address) {
        OracleAdapter oracleAdapter =
            new OracleAdapter(
                addressRegistry,
                tvlSource,
                assets,
                sources,
                aggStalePeriod,
                defaultLockPeriod
            );
        return address(oracleAdapter);
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
    function create() external returns (address) {
        ProxyAdmin proxyAdmin = new ProxyAdmin();
        proxyAdmin.transferOwnership(msg.sender);
        return address(proxyAdmin);
    }
}
