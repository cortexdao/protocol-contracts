// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Ownable} from "contracts/common/Imports.sol";
import {Address} from "contracts/libraries/Imports.sol";

import {ProxyAdmin} from "contracts/proxy/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";
import {MetaPoolTokenProxy} from "contracts/mapt/MetaPoolTokenProxy.sol";
import {PoolToken} from "contracts/pool/PoolToken.sol";
import {PoolTokenProxy} from "contracts/pool/PoolTokenProxy.sol";
import {PoolTokenV2} from "contracts/pool/PoolTokenV2.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {Erc20Allocation} from "contracts/tvl/Erc20Allocation.sol";
import {TvlManager} from "contracts/tvl/TvlManager.sol";
import {OracleAdapter} from "contracts/oracle/OracleAdapter.sol";
import {TransparentUpgradeableProxy} from "contracts/proxy/Imports.sol";

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
abstract contract DeploymentConstants {
    address public constant DAI_ADDRESS =
        0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC_ADDRESS =
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT_ADDRESS =
        0xdAC17F958D2ee523a2206206994597C13D831ec7;

    address public constant POOL_PROXY_ADMIN =
        0x7965283631253DfCb71Db63a60C656DEDF76234f;
    address public constant DAI_POOL_PROXY =
        0x75CE0E501e2E6776FcAAa514f394a88a772A8970;
    address public constant USDC_POOL_PROXY =
        0xe18b0365D5D09F394f84eE56ed29DD2d8D6Fba5f;
    address public constant USDT_POOL_PROXY =
        0xeA9c5a2717D5Ab75afaAC340151e73a7e37d99A7;

    address public constant TVL_AGG_ADDRESS =
        0xDb299D394817D8e7bBe297E84AFfF7106CF92F5f;
    address public constant DAI_USD_AGG_ADDRESS =
        0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9;
    address public constant USDC_USD_AGG_ADDRESS =
        0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6;
    address public constant USDT_USD_AGG_ADDRESS =
        0x3E7d1eAB13ad0104d2750B8863b489D65364e32D;
}

/* solhint-disable func-name-mixedcase, no-empty-blocks */
contract AlphaDeployment is Ownable, DeploymentConstants {
    using Address for address;

    IAddressRegistryV2 public addressRegistry;
    uint256 public step;

    modifier updateStep(uint256 step_) {
        require(step == step_, "INVALID_STEP");
        _;
        step += 1;
    }

    constructor(address addressRegistry_) public {
        addressRegistry = IAddressRegistryV2(addressRegistry_);
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
            Ownable(_poolProxyAdmin()).owner() == address(this),
            "INVALID_POOL_PROXY_ADMIN_OWNER"
        );
    }

    function deploy_1_MetaPoolToken() external onlyOwner updateStep(1) {
        ProxyAdmin proxyAdmin = new ProxyAdmin();
        MetaPoolToken logic = new MetaPoolToken();
        MetaPoolTokenProxy proxy =
            new MetaPoolTokenProxy(
                address(logic),
                address(proxyAdmin),
                address(addressRegistry)
            );

        proxyAdmin.transferOwnership(msg.sender);
        Ownable(address(proxy)).transferOwnership(msg.sender);

        addressRegistry.registerAddress("mApt", address(proxy));
    }

    function deploy_2_DemoPools() external onlyOwner updateStep(2) {
        /* complete proxy deploy for the demo pools */

        ProxyAdmin proxyAdmin = new ProxyAdmin();
        PoolToken logicV1 = new PoolToken();
        PoolTokenV2 logicV2 = new PoolTokenV2();

        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                address(addressRegistry)
            );

        address fakeAggAddress = 0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe;

        PoolTokenProxy daiProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _daiTokenAddress(),
                fakeAggAddress
            );
        proxyAdmin.upgradeAndCall(daiProxy, address(logicV2), initData);

        Ownable(address(daiProxy)).transferOwnership(msg.sender);
        addressRegistry.registerAddress("daiDemoPool", address(daiProxy));

        PoolTokenProxy usdcProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _usdcTokenAddress(),
                fakeAggAddress
            );
        proxyAdmin.upgradeAndCall(usdcProxy, address(logicV2), initData);

        Ownable(address(usdcProxy)).transferOwnership(msg.sender);
        addressRegistry.registerAddress("usdcDemoPool", address(usdcProxy));

        PoolTokenProxy usdtProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _usdtTokenAddress(),
                fakeAggAddress
            );
        proxyAdmin.upgradeAndCall(usdtProxy, address(logicV2), initData);

        Ownable(address(usdtProxy)).transferOwnership(msg.sender);
        addressRegistry.registerAddress("usdtDemoPool", address(usdtProxy));

        proxyAdmin.transferOwnership(msg.sender);
    }

    function deploy_3_TvlManager() external onlyOwner updateStep(3) {
        Erc20Allocation erc20Allocation =
            new Erc20Allocation(address(addressRegistry));
        TvlManager tvlManager = new TvlManager(address(addressRegistry));
        tvlManager.registerAssetAllocation(erc20Allocation);

        addressRegistry.registerAddress("tvlManager", address(tvlManager));
    }

    function deploy_4_OracleAdapter() external onlyOwner updateStep(4) {
        uint256 stalePeriod = 86400;
        uint256 defaultLockPeriod = 270;
        OracleAdapter oracleAdapter =
            new OracleAdapter(
                address(addressRegistry),
                _tvlSource(),
                _oracleAssets(),
                _oracleSources(),
                stalePeriod,
                defaultLockPeriod
            );

        addressRegistry.registerAddress(
            "oracleAdapter",
            address(oracleAdapter)
        );
    }

    function deploy_5_PoolTokenV2_upgrade() external onlyOwner updateStep(5) {
        /* upgrade from v1 to v2 */

        PoolTokenV2 logicV2 = new PoolTokenV2();
        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                addressRegistry
            );
        ProxyAdmin(_poolProxyAdmin()).upgradeAndCall(
            TransparentUpgradeableProxy(_daiPoolAddress()),
            address(logicV2),
            initData
        );
        ProxyAdmin(_poolProxyAdmin()).upgradeAndCall(
            TransparentUpgradeableProxy(_usdcPoolAddress()),
            address(logicV2),
            initData
        );
        ProxyAdmin(_poolProxyAdmin()).upgradeAndCall(
            TransparentUpgradeableProxy(_usdtPoolAddress()),
            address(logicV2),
            initData
        );
    }

    function cleanup() external onlyOwner {
        handoffOwnership(address(addressRegistry));
        handoffOwnership(_poolProxyAdmin());
    }

    function handoffOwnership(address ownedContract) public onlyOwner {
        Ownable(ownedContract).transferOwnership(msg.sender);
    }

    function _daiPoolAddress() internal view virtual returns (address payable) {
        return payable(DAI_POOL_PROXY);
    }

    function _daiTokenAddress() internal view virtual returns (address) {
        return DAI_ADDRESS;
    }

    function _usdcPoolAddress()
        internal
        view
        virtual
        returns (address payable)
    {
        return payable(USDC_POOL_PROXY);
    }

    function _usdcTokenAddress() internal view virtual returns (address) {
        return USDC_ADDRESS;
    }

    function _usdtPoolAddress()
        internal
        view
        virtual
        returns (address payable)
    {
        return payable(USDT_POOL_PROXY);
    }

    function _usdtTokenAddress() internal view virtual returns (address) {
        return USDT_ADDRESS;
    }

    function _poolProxyAdmin() internal view virtual returns (address) {
        return POOL_PROXY_ADMIN;
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
/* solhint-enable func-name-mixedcase */
