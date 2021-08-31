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
import {
    ProxyAdminFactory,
    ProxyFactory,
    Erc20AllocationFactory,
    MetaPoolTokenFactory,
    OracleAdapterFactory,
    PoolTokenV1Factory,
    PoolTokenV2Factory,
    TvlManagerFactory
} from "./factories.sol";

/** @dev
# Alpha Deployment

## Deployment order of contracts

The address registry needs multiple addresses registered
to setup the roles for access control in the contract
constructors:

MetaPoolToken

- emergencySafe (emergency role, default admin role)
- lpSafe (LP role)

PoolTokenV2

- emergencySafe (emergency role, default admin role)
- adminSafe (admin role)
- mApt (contract role)

Erc20Allocation

- emergencySafe (default admin role)
- lpSafe (LP role)
- mApt (contract role)

TvlManager

- emergencySafe (emergency role, default admin role)
- lpSafe (LP role)

OracleAdapter

- emergencySafe (emergency role, default admin role)
- adminSafe (admin role)
- tvlManager (contract role)
- mApt (contract role)

Note the order of dependencies: a contract requires contracts
above it in the list to be deployed first. Thus we need
to deploy in the order given, starting with the Safes.

Other steps:
- LP Safe must approve mAPT for each pool underlyer
*/

/* solhint-disable func-name-mixedcase, no-empty-blocks */
contract AlphaDeployment is Ownable, DeploymentConstants {
    // TODO: figure out a versioning scheme
    uint256 public constant VERSION = 1;

    IAddressRegistryV2 public addressRegistry;

    address public proxyAdminFactory;
    address public proxyFactory;
    address public mAptFactory;
    address public poolTokenV1Factory;
    address public poolTokenV2Factory;
    address public erc20AllocationFactory;
    address public tvlManagerFactory;
    address public oracleAdapterFactory;

    uint256 public step;

    // step 1
    address public mApt;

    // step 2
    address public demoProxyAdmin;
    address public daiDemoPool;
    address public usdcDemoPool;
    address public usdtDemoPool;

    // step 3
    address public erc20Allocation;
    address public tvlManager;

    // step 4
    address public oracleAdapter;

    // step 5
    // pool v2 upgrades
    address public poolTokenV2;

    modifier updateStep(uint256 step_) {
        require(step == step_, "INVALID_STEP");
        _;
        step += 1;
    }

    constructor(
        address addressRegistry_,
        address proxyAdminFactory_,
        address proxyFactory_,
        address mAptFactory_,
        address poolTokenV1Factory_,
        address poolTokenV2Factory_,
        address erc20AllocationFactory_,
        address tvlManagerFactory_,
        address oracleAdapterFactory_
    ) public {
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        proxyAdminFactory = proxyAdminFactory_;
        proxyFactory = proxyFactory_;
        mAptFactory = mAptFactory_;
        poolTokenV1Factory = poolTokenV1Factory_;
        poolTokenV2Factory = poolTokenV2Factory_;
        erc20AllocationFactory = erc20AllocationFactory_;
        tvlManagerFactory = tvlManagerFactory_;
        oracleAdapterFactory = oracleAdapterFactory_;
    }

    function deploy_0_verifyPreConditions() external onlyOwner updateStep(0) {
        // 1. check Safe addresses registered: Emergency, Admin, LP
        addressRegistry.getAddress("emergencySafe");
        addressRegistry.getAddress("adminSafe");
        addressRegistry.lpSafeAddress();
        // 2. check this contract can register addresses
        require(
            Ownable(address(addressRegistry)).owner() == address(this),
            "INVALID_ADDRESS_REGISTRY_OWNER"
        );
        // 4. check this contract can upgrade pools
        require(
            Ownable(POOL_PROXY_ADMIN).owner() == address(this),
            "INVALID_POOL_PROXY_ADMIN_OWNER"
        );
    }

    function deploy_1_MetaPoolToken() external onlyOwner returns (address) {
        address proxyAdmin =
            ProxyAdminFactory(proxyAdminFactory).create(msg.sender);
        bytes memory initData =
            abi.encodeWithSignature(
                "initialize(address,address)",
                proxyAdmin,
                addressRegistry
            );
        address mApt_ =
            MetaPoolTokenFactory(mAptFactory).create(
                proxyFactory,
                proxyAdminFactory,
                initData,
                msg.sender
            );
        addressRegistry.registerAddress("mApt", mApt_);

        mApt = mApt_;
        return mApt_;
    }

    function deploy_2_DemoPools() external onlyOwner updateStep(2) {
        /* complete proxy deploy for the demo pools */

        address proxyAdmin =
            ProxyAdminFactory(proxyAdminFactory).create(msg.sender);

        address fakeAggAddress = 0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe;
        bytes memory daiInitData =
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                proxyAdmin,
                DAI_ADDRESS,
                fakeAggAddress
            );

        address logicV2 = PoolTokenV2Factory(poolTokenV2Factory).create();
        bytes memory initDataV2 =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                address(addressRegistry)
            );

        address daiProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyFactory,
                proxyAdmin,
                daiInitData,
                msg.sender
            );
        ProxyAdmin(proxyAdmin).upgradeAndCall(
            PoolTokenProxy(payable(daiProxy)),
            logicV2,
            initDataV2
        );
        addressRegistry.registerAddress("daiDemoPool", daiProxy);

        bytes memory usdcInitData =
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                proxyAdmin,
                USDC_ADDRESS,
                fakeAggAddress
            );
        address usdcProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyFactory,
                proxyAdmin,
                usdcInitData,
                msg.sender
            );
        ProxyAdmin(proxyAdmin).upgradeAndCall(
            PoolTokenProxy(payable(usdcProxy)),
            logicV2,
            initDataV2
        );
        addressRegistry.registerAddress("usdcDemoPool", usdcProxy);

        bytes memory usdtInitData =
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                proxyAdmin,
                USDT_ADDRESS,
                fakeAggAddress
            );
        address usdtProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyFactory,
                proxyAdmin,
                usdtInitData,
                msg.sender
            );
        ProxyAdmin(proxyAdmin).upgradeAndCall(
            PoolTokenProxy(payable(usdtProxy)),
            logicV2,
            initDataV2
        );
        addressRegistry.registerAddress("usdtDemoPool", usdtProxy);
    }

    function deploy_3_TvlManager() external onlyOwner updateStep(3) {
        address erc20Allocation =
            Erc20AllocationFactory(erc20AllocationFactory).create(
                address(addressRegistry)
            );
        address tvlManager =
            TvlManagerFactory(tvlManagerFactory).create(address(addressRegistry));
        TvlManager(tvlManager).registerAssetAllocation(
            Erc20Allocation(erc20Allocation)
        );

        addressRegistry.registerAddress("tvlManager", address(tvlManager));
    }

    function deploy_4_OracleAdapter() external onlyOwner updateStep(4) {
        address oracleAdapter =
            OracleAdapterFactory(oracleAdapterFactory).create(address(addressRegistry));
        addressRegistry.registerAddress("oracleAdapter", oracleAdapter);
    }

    function deploy_5_PoolTokenV2_upgrade() external onlyOwner updateStep(5) {
        /* upgrade from v1 to v2 */

        // PoolTokenV2 logicV2 = new PoolTokenV2();
        address logicV2 = PoolTokenV2Factory(poolTokenV2Factory).create();
        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                addressRegistry
            );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            TransparentUpgradeableProxy(payable(DAI_POOL_PROXY)),
            logicV2,
            initData
        );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            TransparentUpgradeableProxy(payable(USDC_POOL_PROXY)),
            logicV2,
            initData
        );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            TransparentUpgradeableProxy(payable(USDT_POOL_PROXY)),
            logicV2,
            initData
        );
    }

    function cleanup() external onlyOwner {
        handoffOwnership(address(addressRegistry));
        handoffOwnership(POOL_PROXY_ADMIN);
    }

    function handoffOwnership(address ownedContract) public onlyOwner {
        Ownable(ownedContract).transferOwnership(msg.sender);
    }
}
/* solhint-enable func-name-mixedcase */
