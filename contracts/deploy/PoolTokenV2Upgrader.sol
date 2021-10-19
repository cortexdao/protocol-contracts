// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20, IDetailedERC20, Ownable} from "contracts/common/Imports.sol";
import {Address, SafeMath} from "contracts/libraries/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";
import {AggregatorV3Interface} from "contracts/oracle/Imports.sol";
import {PoolToken} from "contracts/pool/PoolToken.sol";
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
    using SafeMath for uint256;

    // TODO: figure out a versioning scheme
    string public constant VERSION = "1.0.0";

    address private constant FAKE_AGG_ADDRESS =
        0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe;

    IAddressRegistryV2 public addressRegistry;

    address public poolTokenV2Factory;

    address public immutable emergencySafe;
    address public immutable adminSafe;
    address public immutable lpSafe;

    address public poolTokenV2;

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
        address mApt = addressRegistry.mAptAddress();

        address[] memory ownerships = new address[](1);
        ownerships[0] = POOL_PROXY_ADMIN;
        checkOwnerships(ownerships);

        uint256 usdcDepositAmount =
            IERC20(USDC_ADDRESS).balanceOf(address(this));
        require(usdcDepositAmount > 0, "FUND_UPGRADER_WITH_USDC");

        PoolToken poolV1 = PoolToken(payable(USDC_POOL_PROXY));
        poolV1.addLiquidity(usdcDepositAmount);

        uint256 aptBalance = poolV1.balanceOf(address(this));
        require(aptBalance > 0, "DEPOSIT_FAILED");

        uint256 allowance = aptBalance.div(2);
        poolV1.approve(msg.sender, allowance);

        bytes memory initData =
            abi.encodeWithSelector(
                PoolTokenV2.initializeUpgrade.selector,
                addressRegistry
            );
        _upgradePool(USDC_POOL_PROXY, POOL_PROXY_ADMIN, initData);

        PoolTokenV2 poolV2 = PoolTokenV2(USDC_POOL_PROXY);
        // after upgrade, we need to check:
        // 1. _balances mapping uses the correct slot
        require(
            poolV2.balanceOf(address(this)) == aptBalance,
            "BALANCEOF_TEST_FAILED"
        );
        // 2. _allowances mapping uses the correct slot
        require(
            poolV2.allowance(address(this), msg.sender) == allowance,
            "ALLOWANCES_TEST_FAILED"
        );

        require(
            poolV2.addressRegistry() == addressRegistry,
            "INCORRECT_ADDRESS_REGISTRY"
        );

        bytes32 DEFAULT_ADMIN_ROLE = poolV2.DEFAULT_ADMIN_ROLE();
        bytes32 EMERGENCY_ROLE = poolV2.EMERGENCY_ROLE();
        bytes32 ADMIN_ROLE = poolV2.ADMIN_ROLE();
        bytes32 CONTRACT_ROLE = poolV2.CONTRACT_ROLE();
        require(
            poolV2.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe),
            "ROLE_TEST_FAILED"
        );
        require(
            poolV2.hasRole(EMERGENCY_ROLE, emergencySafe),
            "ROLE_TEST_FAILED"
        );
        require(poolV2.hasRole(ADMIN_ROLE, adminSafe), "ROLE_TEST_FAILED");
        require(poolV2.hasRole(CONTRACT_ROLE, mApt), "ROLE_TEST_FAILED");

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
