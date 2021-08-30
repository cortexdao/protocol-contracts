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
/* solhint-disable func-name-mixedcase, no-empty-blocks */
contract AlphaDeployer is Ownable {
    using Address for address;

    address public addressRegistry;
    uint256 public step;

    constructor(address addressRegistry_) public {
        addressRegistry = addressRegistry_;
    }

    function deploy_0_verifyAddressRegistrations()
        external
        onlyOwner
        updateStep(0)
    {
        // 1. check Safe addresses registered: Emergency, Admin, LP
        IAddressRegistryV2(addressRegistry).getAddress("emergencySafe");
        IAddressRegistryV2(addressRegistry).getAddress("adminSafe");
        IAddressRegistryV2(addressRegistry).lpSafeAddress();
        // 2. check pool addresses: DAI, USDC, USDT
        IAddressRegistryV2(addressRegistry).daiPoolAddress();
        IAddressRegistryV2(addressRegistry).usdcPoolAddress();
        IAddressRegistryV2(addressRegistry).usdtPoolAddress();
        // 3. check this contract can register addresses
        require(
            Ownable(addressRegistry).owner() == address(this),
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
                addressRegistry
            );

        proxyAdmin.transferOwnership(msg.sender);
        Ownable(address(proxy)).transferOwnership(msg.sender);

        IAddressRegistryV2(addressRegistry).registerAddress(
            "mApt",
            address(proxy)
        );
    }

    function deploy_2_DemoPools() external onlyOwner updateStep(2) {
        /* complete proxy deploy for the demo pools */

        ProxyAdmin proxyAdmin = new ProxyAdmin();
        PoolToken logicV1 = new PoolToken();
        PoolTokenV2 logicV2 = new PoolTokenV2();

        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                addressRegistry
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
        IAddressRegistryV2(addressRegistry).registerAddress(
            "daiDemoPool",
            address(daiProxy)
        );

        PoolTokenProxy usdcProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _usdcTokenAddress(),
                fakeAggAddress
            );
        proxyAdmin.upgradeAndCall(usdcProxy, address(logicV2), initData);

        Ownable(address(usdcProxy)).transferOwnership(msg.sender);
        IAddressRegistryV2(addressRegistry).registerAddress(
            "usdcDemoPool",
            address(usdcProxy)
        );

        PoolTokenProxy usdtProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _usdtTokenAddress(),
                fakeAggAddress
            );
        proxyAdmin.upgradeAndCall(usdtProxy, address(logicV2), initData);

        Ownable(address(usdtProxy)).transferOwnership(msg.sender);
        IAddressRegistryV2(addressRegistry).registerAddress(
            "usdtDemoPool",
            address(usdtProxy)
        );

        proxyAdmin.transferOwnership(msg.sender);
    }

    function deploy_3_TvlManager() external onlyOwner updateStep(3) {
        Erc20Allocation erc20Allocation = new Erc20Allocation(addressRegistry);
        TvlManager tvlManager = new TvlManager(addressRegistry);
        tvlManager.registerAssetAllocation(erc20Allocation);

        IAddressRegistryV2(addressRegistry).registerAddress(
            "tvlManager",
            address(tvlManager)
        );
    }

    function deploy_4_OracleAdapter() external onlyOwner updateStep(4) {
        uint256 stalePeriod = 86400;
        uint256 defaultLockPeriod = 270;
        OracleAdapter oracleAdapter =
            new OracleAdapter(
                addressRegistry,
                _tvlSource(),
                _oracleAssets(),
                _oracleSources(),
                stalePeriod,
                defaultLockPeriod
            );

        IAddressRegistryV2(addressRegistry).registerAddress(
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

    function _daiPoolAddress() internal view returns (address payable) {
        // TODO: consider just hardcoding the address here; we can still dynamically
        // set the address for unit testing by overriding in a child, test contract
        return
            payable(IAddressRegistryV2(addressRegistry).getAddress("daiPool"));
    }

    function _daiTokenAddress() internal view returns (address) {
        // TODO: consider just hardcoding the address here; we can still dynamically
        // set the address for unit testing by overriding in a child, test contract
        address daiPool = _daiPoolAddress();
        return address(PoolTokenV2(daiPool).underlyer());
    }

    function _usdcPoolAddress() internal view returns (address payable) {
        return
            payable(IAddressRegistryV2(addressRegistry).getAddress("usdcPool"));
    }

    function _usdcTokenAddress() internal view returns (address) {
        PoolTokenV2 usdcPool = PoolTokenV2(_usdcPoolAddress());
        return address(usdcPool.underlyer());
    }

    function _usdtPoolAddress() internal view returns (address payable) {
        return
            payable(IAddressRegistryV2(addressRegistry).getAddress("usdtPool"));
    }

    function _usdtTokenAddress() internal view returns (address) {
        PoolTokenV2 usdtPool = PoolTokenV2(_usdtPoolAddress());
        return address(usdtPool.underlyer());
    }

    function _poolProxyAdmin() internal view returns (address) {
        PoolTokenV2 daiPool = PoolTokenV2(_daiPoolAddress());
        return daiPool.proxyAdmin();
    }

    modifier updateStep(uint256 step_) {
        require(step == step_, "INVALID_STEP");
        _;
        step += 1;
    }

    function _oracleAssets() internal returns (address[] memory) {}

    function _tvlSource() internal returns (address) {}

    function _oracleSources() internal returns (address[] memory) {}
}
/* solhint-enable func-name-mixedcase */
