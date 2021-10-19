// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20, Ownable} from "contracts/common/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";
import {AggregatorV3Interface} from "contracts/oracle/Imports.sol";
import {PoolTokenV2} from "contracts/pool/PoolTokenV2.sol";
import {LpAccount} from "contracts/lpaccount/LpAccount.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {AddressRegistryV2} from "contracts/registry/AddressRegistryV2.sol";
import {
    ProxyAdmin,
    TransparentUpgradeableProxy
} from "contracts/proxy/Imports.sol";
import {IAssetAllocationRegistry} from "contracts/tvl/Imports.sol";

import {DeploymentConstants} from "./constants.sol";
import {PoolTokenV2Factory} from "./factories/Imports.sol";
import {IGnosisModuleManager, Enum} from "./IGnosisModuleManager.sol";

/* solhint-disable max-states-count, func-name-mixedcase */
contract PoolTokenV2Upgrader is Ownable, DeploymentConstants {
    // TODO: figure out a versioning scheme
    string public constant VERSION = "1.0.0";

    address private constant FAKE_AGG_ADDRESS =
        0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe;

    IAddressRegistryV2 public addressRegistry;

    address public immutable poolTokenV2Factory;

    address public immutable emergencySafe;
    address public immutable adminSafe;
    address public immutable lpSafe;

    address public poolTokenV2;

    modifier updateStep(uint256 step_) {
        require(step == step_, "INVALID_STEP");
        _;
        step += 1;
    }

    /**
     * @dev Uses `getAddress` in case `AddressRegistry` has not been upgraded
     */
    modifier checkSafeRegistrations() {
        require(
            addressRegistry.getAddress("emergencySafe") == emergencySafe,
            "INVALID_EMERGENCY_SAFE"
        );

        require(
            addressRegistry.getAddress("adminSafe") == adminSafe,
            "INVALID_ADMIN_SAFE"
        );

        require(
            addressRegistry.getAddress("lpSafe") == lpSafe,
            "INVALID_LP_SAFE"
        );

        _;
    }

    constructor(address poolTokenV2Factory_) public {
        addressRegistry = IAddressRegistryV2(ADDRESS_REGISTRY_PROXY);

        // Simplest to check now that Safes are deployed in order to
        // avoid repeated preconditions checks later.
        emergencySafe = addressRegistry.getAddress("emergencySafe");
        adminSafe = addressRegistry.getAddress("adminSafe");
        lpSafe = addressRegistry.getAddress("lpSafe");

        setPoolTokenV2Factory(poolTokenV2Factory_);
    }

    /**
     * @dev
     *   Check a contract address from a previous step's deployment
     *   is registered with expected ID.
     *
     * @param registeredIds identifiers for the Address Registry
     * @param deployedAddresses addresses from previous steps' deploys
     */
    function checkRegisteredDependencies(
        bytes32[] memory registeredIds,
        address[] memory deployedAddresses
    ) public view virtual {
        require(
            registeredIds.length == deployedAddresses.length,
            "LENGTH_MISMATCH"
        );

        for (uint256 i = 0; i < registeredIds.length; i++) {
            require(
                addressRegistry.getAddress(registeredIds[i]) ==
                    deployedAddresses[i],
                "MISSING_DEPLOYED_ADDRESS"
            );
        }
    }

    /**
     * @dev
     *   Check the deployment contract has ownership of necessary
     *   contracts to perform actions, e.g. register an address or upgrade
     *   a proxy.
     *
     * @param ownedContracts addresses that should be owned by this contract
     */
    function checkOwnerships(address[] memory ownedContracts)
        public
        view
        virtual
    {
        for (uint256 i = 0; i < ownedContracts.length; i++) {
            require(
                Ownable(ownedContracts[i]).owner() == adminSafe,
                "MISSING_OWNERSHIP"
            );
        }
    }

    function setPoolTokenV2Factory(address poolTokenV2Factory_)
        public
        onlyOwner
    {
        require(
            Address.isContract(poolTokenV2Factory_),
            "INVALID_FACTORY_ADDRESS"
        );
        poolTokenV2Factory = poolTokenV2Factory_;
    }

    function deployV2Logic() external onlyOwner {
        poolTokenV2 = PoolTokenV2Factory(poolTokenV2Factory).create();

        // Initialize logic storage to block possible attack vector:
        // attacker may control and selfdestruct the logic contract
        // if more powerful functionality is added later
        PoolTokenV2(poolTokenV2).initialize(
            POOL_PROXY_ADMIN,
            IDetailedERC20(DAI_ADDRESS),
            AggregatorV3Interface(FAKE_AGG_ADDRESS)
        );
    }

    /// @notice upgrade from v1 to v2
    /// @dev register mAPT for a contract role
    function upgrade() external onlyOwner checkSafeRegistrations {
        bytes32[] memory registeredIds = new bytes32[](1);
        address[] memory deployedAddresses = new address[](1);
        (registeredIds[0], deployedAddresses[0]) = ("mApt", mApt);
        checkRegisteredDependencies(registeredIds, deployedAddresses);

        address[] memory ownerships = new address[](1);
        ownerships[0] = POOL_PROXY_ADMIN;
        checkOwnerships(ownerships);

        uint256 usdcDepositAmount =
            IERC20(USDC_ADDRESS).balanceOf(address(this));
        require(usdcDepositAmount > 0, "FUND_UPGRADER_WITH_USDC");
        PoolTokenV1(USDC_POOL_PROXY).addLiquidity(usdcDepositAmount);

        uint256 aptBalance =
            PoolTokenV1(USDC_POOL_PROXY).balanceOf(address(this));
        require(aptBalance > 0, "DEPOSIT_FAILED");

        uint256 allowance = aptBalance.div(2);
        PoolTokenV1(USDC_POOL_PROXY).approve(msg.sender, allowance);

        bytes memory initData =
            abi.encodeWithSelector(
                PoolTokenV2.initializeUpgrade.selector,
                addressRegistry
            );
        _upgradePool(USDC_POOL_PROXY, POOL_PROXY_ADMIN, initData);

        // after upgrade, we need to check:
        // 1. balances mapping uses the correct slot
        require(
            PoolTokenV2(USDC_POOL_PROXY).balanceOf(address(this)) == aptBalance,
            "BALANCEOF_TEST_FAILED"
        );
        // 2. allowances mapping uses the correct slot
        require(
            PoolTokenV2(USDC_POOL_PROXY).allowances(
                address(this),
                msg.sender
            ) == allowance,
            "ALLOWANCES_TEST_FAILED"
        );

        require(
            PoolTokenV2(USDC_POOL_PROXY).addressRegistry() == addressRegistry,
            "INCORRECT_ADDRESS_REGISTRY"
        );

        bytes32 DEFAULT_ADMIN_ROLE =
            PoolTokenV2(USDC_POOL_PROXY).DEFAULT_ADMIN_ROLE();
        bytes32 EMERGENCY_ROLE = PoolTokenV2(USDC_POOL_PROXY).EMERGENCY_ROLE();
        bytes32 ADMIN_ROLE = PoolTokenV2(USDC_POOL_PROXY).ADMIN_ROLE();
        bytes32 CONTRACT_ROLE = PoolTokenV2(USDC_POOL_PROXY).CONTRACT_ROLE();
        require(
            PoolTokenV2(USDC_POOL_PROXY).hasRole(
                DEFAULT_ADMIN_ROLE,
                emergencySafe
            ),
            "ROLE_TEST_FAILED"
        );
        require(
            PoolTokenV2(USDC_POOL_PROXY).hasRole(EMERGENCY_ROLE, emergencySafe),
            "ROLE_TEST_FAILED"
        );
        require(
            PoolTokenV2(USDC_POOL_PROXY).hasRole(ADMIN_ROLE, adminSafe),
            "ROLE_TEST_FAILED"
        );
        require(
            PoolTokenV2(USDC_POOL_PROXY).hasRole(CONTRACT_ROLE, mApt),
            "ROLE_TEST_FAILED"
        );

        // _upgradePool(DAI_POOL_PROXY, POOL_PROXY_ADMIN, initData);
        //_upgradePool(USDT_POOL_PROXY, POOL_PROXY_ADMIN, initData);
    }

    function _upgradePool(
        address proxy,
        address proxyAdmin,
        bytes memory initData
    ) internal {
        bytes memory data =
            abi.encodeWithSelector(
                ProxyAdmin.upgradeAndCall.selector,
                TransparentUpgradeableProxy(payable(proxy)),
                poolTokenV2,
                initData
            );

        require(
            IGnosisModuleManager(adminSafe).execTransactionFromModule(
                proxyAdmin,
                0,
                data,
                Enum.Operation.Call
            ),
            "SAFE_TX_FAILED"
        );
    }
}
/* solhint-enable func-name-mixedcase */
