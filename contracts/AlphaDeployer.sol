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

    address public addressRegistry;

    constructor(address addressRegistry_) public {
        addressRegistry = addressRegistry_;
    }

    function deploy_0_Safes() external onlyOwner {}

    function deploy_1_MetaPoolToken() external onlyOwner {
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

    function deploy_2_DemoPools() external onlyOwner {
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
                DAI_ADDRESS,
                0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe
            );
        proxyAdmin.upgradeAndCall(daiProxy, address(logicV2), initData);

        PoolTokenProxy usdcProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                USDC_ADDRESS,
                0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe
            );
        proxyAdmin.upgradeAndCall(usdcProxy, address(logicV2), initData);

        PoolTokenProxy usdtProxy =
            new PoolTokenProxy(
                address(logicV1),
                address(proxyAdmin),
                USDT_ADDRESS,
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

    function deploy_3_Erc20Allocation() external onlyOwner {}

    function deploy_4_TvlManager() external onlyOwner {}

    function deploy_5_OracleAdapter() external onlyOwner {}

    function deploy_6_PoolTokenV2_upgrade() external onlyOwner {
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
                DAI_POOL_PROXY,
                address(logicV2),
                initData
            );
        POOL_PROXY_ADMIN.functionDelegateCall(daiUpgradeData);

        bytes memory usdcUpgradeData =
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                USDC_POOL_PROXY,
                address(logicV2),
                initData
            );
        POOL_PROXY_ADMIN.functionDelegateCall(usdcUpgradeData);

        bytes memory usdtUpgradeData =
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                USDT_POOL_PROXY,
                address(logicV2),
                initData
            );
        POOL_PROXY_ADMIN.functionDelegateCall(usdtUpgradeData);
    }
}
/* solhint-enable func-name-mixedcase */
