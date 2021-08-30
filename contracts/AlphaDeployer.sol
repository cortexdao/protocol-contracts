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
        // 2. check pool addresses: DAI, USDC, USDT
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

        addressRegistry.functionDelegateCall(
            abi.encodeWithSignature(
                "registerAddress(bytes32,address)",
                "mApt",
                address(proxy)
            )
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

        PoolTokenProxy daiProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _daiTokenAddress(),
                0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe
            );
        proxyAdmin.upgradeAndCall(daiProxy, address(logicV2), initData);

        PoolTokenProxy usdcProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _usdcTokenAddress(),
                0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe
            );
        proxyAdmin.upgradeAndCall(usdcProxy, address(logicV2), initData);

        PoolTokenProxy usdtProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                _usdtTokenAddress(),
                0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe
            );
        proxyAdmin.upgradeAndCall(usdtProxy, address(logicV2), initData);

        proxyAdmin.transferOwnership(msg.sender);

        Ownable(address(daiProxy)).transferOwnership(msg.sender);
        addressRegistry.functionDelegateCall(
            abi.encodeWithSignature(
                "registerAddress(bytes32,address)",
                "daiDemoPool",
                address(daiProxy)
            )
        );

        Ownable(address(usdcProxy)).transferOwnership(msg.sender);
        addressRegistry.functionDelegateCall(
            abi.encodeWithSignature(
                "registerAddress(bytes32,address)",
                "usdcDemoPool",
                address(usdcProxy)
            )
        );

        Ownable(address(usdtProxy)).transferOwnership(msg.sender);
        addressRegistry.functionDelegateCall(
            abi.encodeWithSignature(
                "registerAddress(bytes32,address)",
                "usdtDemoPool",
                address(usdtProxy)
            )
        );
    }

    function deploy_3_Erc20Allocation() external onlyOwner updateStep(3) {}

    function deploy_4_TvlManager() external onlyOwner updateStep(4) {}

    function deploy_5_OracleAdapter() external onlyOwner updateStep(5) {}

    function deploy_6_PoolTokenV2_upgrade() external onlyOwner updateStep(6) {
        /* upgrade from v1 to v2 */

        PoolTokenV2 logicV2 = new PoolTokenV2();
        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                addressRegistry
            );

        bytes memory daiUpgradeData =
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                _daiPoolAddress(),
                address(logicV2),
                initData
            );
        _poolProxyAdmin().functionDelegateCall(daiUpgradeData);

        bytes memory usdcUpgradeData =
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                _usdcPoolAddress(),
                address(logicV2),
                initData
            );
        _poolProxyAdmin().functionDelegateCall(usdcUpgradeData);

        bytes memory usdtUpgradeData =
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                _usdtPoolAddress(),
                address(logicV2),
                initData
            );
        _poolProxyAdmin().functionDelegateCall(usdtUpgradeData);
    }

    function _daiPoolAddress() internal view returns (address) {
        return IAddressRegistryV2(addressRegistry).getAddress("daiPool");
    }

    function _daiTokenAddress() internal view returns (address) {
        address daiPool = _daiPoolAddress();
        return address(PoolTokenV2(daiPool).underlyer());
    }

    function _usdcPoolAddress() internal view returns (address) {
        return IAddressRegistryV2(addressRegistry).getAddress("usdcPool");
    }

    function _usdcTokenAddress() internal view returns (address) {
        PoolTokenV2 usdcPool = PoolTokenV2(_usdcPoolAddress());
        return address(usdcPool.underlyer());
    }

    function _usdtPoolAddress() internal view returns (address) {
        return IAddressRegistryV2(addressRegistry).getAddress("usdtPool");
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
}
/* solhint-enable func-name-mixedcase */
