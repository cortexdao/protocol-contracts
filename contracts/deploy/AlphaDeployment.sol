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

    address public mAptFactory;
    address public poolTokenV1Factory;
    address public poolTokenV2Factory;
    address public erc20AllocationFactory;
    address public tvlManagerFactory;
    address public oracleAdapterFactory;
    address public proxyAdminFactory;

    uint256 public step;

    modifier updateStep(uint256 step_) {
        require(step == step_, "INVALID_STEP");
        _;
        step += 1;
    }

    constructor(
        address addressRegistry_,
        address mAptFactory_,
        address poolTokenV1Factory_,
        address poolTokenV2Factory_,
        address erc20AllocationFactory_,
        address tvlManagerFactory_,
        address oracleAdapterFactory_,
        address proxyAdminFactory_
    ) public {
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        mAptFactory = mAptFactory_;
        poolTokenV1Factory = poolTokenV1Factory_;
        poolTokenV2Factory = poolTokenV2Factory_;
        erc20AllocationFactory = erc20AllocationFactory_;
        tvlManagerFactory = tvlManagerFactory_;
        oracleAdapterFactory = oracleAdapterFactory_;
        proxyAdminFactory = proxyAdminFactory_;
    }

    function deploy_0_verifyPreConditions() external onlyOwner updateStep(0) {
        // 1. check Safe addresses registered: Emergency, Admin, LP
        addressRegistry.getAddress("emergencySafe");
        addressRegistry.getAddress("adminSafe");
        addressRegistry.lpSafeAddress();
        // 2. check pool addresses: DAI, USDC, USDT
        addressRegistry.daiPoolAddress();
        addressRegistry.usdcPoolAddress();
        addressRegistry.usdtPoolAddress();
        // 3. check this contract can register addresses
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

    function deploy_1_MetaPoolToken()
        external
        onlyOwner
        updateStep(1)
        returns (address)
    {
        address mApt =
            MetaPoolTokenFactory(mAptFactory).createWithProxyAdmin(msg.sender);
        addressRegistry.registerAddress("mApt", mApt);
        return mApt;
    }

    function deploy_2_DemoPools() external onlyOwner updateStep(2) {
        /* complete proxy deploy for the demo pools */

        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                address(addressRegistry)
            );
        address logicV2 = PoolTokenV2Factory(poolTokenV2Factory).create();

        address daiProxy =
            PoolTokenV1Factory(poolTokenV1Factory).createWithProxyAdmin(
                DAI_ADDRESS,
                msg.sender
            );
        address proxyAdmin = PoolToken(payable(daiProxy)).proxyAdmin();
        ProxyAdmin(proxyAdmin).upgradeAndCall(
            PoolTokenProxy(payable(daiProxy)),
            logicV2,
            initData
        );
        addressRegistry.registerAddress("daiDemoPool", daiProxy);

        address usdcProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyAdmin,
                USDC_ADDRESS,
                msg.sender
            );
        ProxyAdmin(proxyAdmin).upgradeAndCall(
            PoolTokenProxy(payable(usdcProxy)),
            logicV2,
            initData
        );
        addressRegistry.registerAddress("usdcDemoPool", usdcProxy);

        address usdtProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyAdmin,
                USDT_ADDRESS,
                msg.sender
            );
        ProxyAdmin(proxyAdmin).upgradeAndCall(
            PoolTokenProxy(payable(usdtProxy)),
            logicV2,
            initData
        );
        addressRegistry.registerAddress("usdtDemoPool", usdtProxy);
    }

    function deploy_3_TvlManager() external onlyOwner updateStep(3) {
        address erc20Allocation =
            Erc20AllocationFactory(erc20AllocationFactory).create();
        address tvlManager = TvlManagerFactory(tvlManagerFactory).create();
        TvlManager(tvlManager).registerAssetAllocation(
            Erc20Allocation(erc20Allocation)
        );

        addressRegistry.registerAddress("tvlManager", address(tvlManager));
    }

    function deploy_4_OracleAdapter() external onlyOwner updateStep(4) {
        address oracleAdapter =
            OracleAdapterFactory(oracleAdapterFactory).create();
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
