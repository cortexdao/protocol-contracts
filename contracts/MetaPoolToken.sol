// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    Address
} from "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import {
    SafeMath
} from "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import {SignedSafeMath} from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import {
    Initializable
} from "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import {
    PausableUpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import {
    ReentrancyGuardUpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import {
    IDetailedERC20UpgradeSafe
} from "./interfaces/IDetailedERC20UpgradeSafe.sol";
import {
    ERC20UpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import {
    SafeERC20 as SafeERC20UpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import {AccessControlUpgradeSafe} from "./utils/AccessControlUpgradeSafe.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";
import {IMintable} from "./interfaces/IMintable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {ILpSafeFunder} from "./interfaces/ILpSafeFunder.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";

/**
 * @title Meta Pool Token
 * @author APY.Finance
 * @notice This token is used to keep track of the capital that has been
 * pulled from the PoolToken contracts.
 *
 * When the PoolManager pulls capital from the PoolToken contracts to
 * deploy to yield farming strategies, it will mint mAPT and transfer it to
 * the PoolToken contracts. The ratio of the mAPT held by each PoolToken
 * to the total supply of mAPT determines the amount of the TVL dedicated to
 * PoolToken.
 *
 * DEPLOY CAPITAL TO YIELD FARMING STRATEGIES
 * Tracks the share of deployed TVL owned by an PoolToken using mAPT.
 *
 * +-------------+   PoolManager.fundAccount   +-------------+
 * |             |---------------------------->|             |
 * | PoolTokenV2 |     MetaPoolToken.mint      | PoolManager |
 * |             |<----------------------------|             |
 * +-------------+                             +-------------+
 *
 *
 * WITHDRAW CAPITAL FROM YIELD FARMING STRATEGIES
 * Uses mAPT to calculate the amount of capital returned to the PoolToken.
 *
 * +-------------+    PoolManager.withdrawFromAccount   +-------------+
 * |             |<-------------------------------------|             |
 * | PoolTokenV2 |          MetaPoolToken.burn          | PoolManager |
 * |             |------------------------------------->|             |
 * +-------------+                                      +-------------+
 */
contract MetaPoolToken is
    Initializable,
    AccessControlUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    ERC20UpgradeSafe,
    IMintable
{
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeERC20UpgradeSafe for IDetailedERC20UpgradeSafe;

    uint256 public constant DEFAULT_MAPT_TO_UNDERLYER_FACTOR = 1000;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    /** @notice used to protect init functions for upgrades */
    address public proxyAdmin;
    /** @notice used to protect mint and burn function */
    IAddressRegistryV2 public addressRegistry;

    /* ------------------------------- */

    event Mint(address acccount, uint256 amount);
    event Burn(address acccount, uint256 amount);
    event AdminChanged(address);

    /**
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /**
     * @dev Since the proxy delegate calls to this "logic" contract, any
     * storage set by the logic contract's constructor during deploy is
     * disregarded and this function is needed to initialize the proxy
     * contract's storage according to this contract's layout.
     *
     * Since storage is not set yet, there is no simple way to protect
     * calling this function with owner modifiers.  Thus the OpenZeppelin
     * `initializer` modifier protects this function from being called
     * repeatedly.  It should be called during the deployment so that
     * it cannot be called by someone else later.
     */
    function initialize(address adminAddress, address addressRegistry_)
        external
        initializer
    {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY MetaPool Token", "mAPT");

        // initialize impl-specific storage
        _setAdminAddress(adminAddress);
        _setAddressRegistry(addressRegistry_);
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(CONTRACT_ROLE, addressRegistry.poolManagerAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.getAddress("emergencySafe"));
    }

    /**
     * @dev Dummy function to show how one would implement an init function
     * for future upgrades.  Note the `initializer` modifier can only be used
     * once in the entire contract, so we can't use it here.  Instead,
     * we set the proxy admin address as a variable and protect this
     * function with `onlyAdmin`, which only allows the proxy admin
     * to call this function during upgrades.
     */
    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function emergencySetAdminAddress(address adminAddress)
        external
        onlyEmergencyRole
    {
        _setAdminAddress(adminAddress);
    }

    function _setAdminAddress(address adminAddress) internal {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }

    function mint(ILpSafeFunder.PoolAmount[] calldata depositAmounts)
        external
        override
        nonReentrant
        onlyContractRole
    {
        uint256[] memory deltas = _calculateDeltas(depositAmounts);

        for (uint256 j = 0; j < depositAmounts.length; j++) {
            if (deltas[j] == 0) {
                continue;
            }

            PoolTokenV2 pool = depositAmounts[j].pool;
            uint256 amount = depositAmounts[j].amount;

            _mint(address(pool), deltas[j]);
            pool.transferToLpSafe(amount);

            emit Mint(address(pool), amount);
        }

        IOracleAdapter oracleAdapter = _getOracleAdapter();
        oracleAdapter.lock();
    }

    function burn(ILpSafeFunder.PoolAmount[] calldata withdrawAmounts)
        external
        override
        nonReentrant
        onlyContractRole
    {
        address lpSafe = addressRegistry.lpSafeAddress();

        uint256[] memory deltas = _calculateDeltas(withdrawAmounts);

        for (uint256 j = 0; j < withdrawAmounts.length; j++) {
            if (deltas[j] == 0) {
                continue;
            }

            PoolTokenV2 pool = withdrawAmounts[j].pool;
            uint256 amount = withdrawAmounts[j].amount;

            _burn(address(pool), amount);

            IDetailedERC20UpgradeSafe underlyer = pool.underlyer();
            underlyer.safeTransferFrom(lpSafe, address(pool), amount);

            emit Burn(lpSafe, amount);
        }

        IOracleAdapter oracleAdapter = _getOracleAdapter();
        oracleAdapter.lock();
    }

    /**
     * @notice Get the USD value of all assets in the system, not just those
     * being managed by the AccountManager but also the pool underlyers.
     *
     * Note this is NOT the same as the total value represented by the
     * total mAPT supply, i.e. the "deployed capital".
     *
     * @dev Chainlink nodes read from the TVLManager, pull the
     * prices from market feeds, and submits the calculated total value
     * to an aggregator contract.
     *
     * USD prices have 8 decimals.
     *
     * @return "Total Value Locked", the USD value of all APY Finance assets.
     */
    function getTvl() public view returns (uint256) {
        IOracleAdapter oracleAdapter = _getOracleAdapter();
        return oracleAdapter.getTvl();
    }

    /**
     * @notice Calculate amount in pool's underlyer token from given mAPT amount.
     * @param mAptAmount mAPT amount to be converted
     * @param tokenPrice Pool underlyer's USD price (in wei) per underlyer token
     * @param decimals Pool underlyer's number of decimals
     * @dev Price parameter is in units of wei per token ("big" unit), since
     * attempting to express wei per token bit ("small" unit) will be
     * fractional, requiring fixed-point representation.  This means we need
     * to also pass in the underlyer's number of decimals to do the appropriate
     * multiplication in the calculation.
     */
    function calculatePoolAmount(
        uint256 mAptAmount,
        uint256 tokenPrice,
        uint256 decimals
    ) external view returns (uint256) {
        if (mAptAmount == 0) return 0;
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        uint256 poolValue = mAptAmount.mul(getTvl()).div(totalSupply());
        uint256 poolAmount = poolValue.mul(10**decimals).div(tokenPrice);
        return poolAmount;
    }

    /**
     * @notice Get the USD-denominated value (in wei) of the pool's share
     * of the deployed capital, as tracked by the mAPT token.
     * @return uint256
     */
    function getDeployedValue(address pool) external view returns (uint256) {
        uint256 balance = balanceOf(pool);
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0 || balance == 0) return 0;

        return getTvl().mul(balance).div(totalSupply);
    }

    function _getOracleAdapter() internal view returns (IOracleAdapter) {
        address oracleAdapterAddress = addressRegistry.oracleAdapterAddress();
        return IOracleAdapter(oracleAdapterAddress);
    }

    function _calculateDeltas(ILpSafeFunder.PoolAmount[] memory amounts)
        internal
        returns (uint256[] memory)
    {
        uint256[] memory deltas = new uint256[](amounts.length);

        for (uint256 i = 0; i < amounts.length; i++) {
            PoolTokenV2 pool = amounts[i].pool;
            uint256 amount = amounts[i].amount;

            IDetailedERC20UpgradeSafe underlyer = pool.underlyer();
            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();

            deltas[i] = _calculateDelta(amount, tokenPrice, decimals);
        }

        return deltas;
    }

    /**
     * @notice Calculate mAPT amount for given pool's underlyer amount.
     * @param amount Pool underlyer amount to be converted
     * @param tokenPrice Pool underlyer's USD price (in wei) per underlyer token
     * @param decimals Pool underlyer's number of decimals
     * @dev Price parameter is in units of wei per token ("big" unit), since
     * attempting to express wei per token bit ("small" unit) will be
     * fractional, requiring fixed-point representation.  This means we need
     * to also pass in the underlyer's number of decimals to do the appropriate
     * multiplication in the calculation.
     * @dev amount of APT minted should be in same ratio to APT supply
     * as deposit value is to pool's total value, i.e.:
     *
     * mint amount / total supply
     * = deposit value / pool total value
     *
     * For denominators, pre or post-deposit amounts can be used.
     * The important thing is they are consistent, i.e. both pre-deposit
     * or both post-deposit.
     */
    function _calculateDelta(
        uint256 amount,
        uint256 tokenPrice,
        uint8 decimals
    ) internal view returns (uint256) {
        uint256 value = amount.mul(tokenPrice).div(10**uint256(decimals));
        uint256 totalValue = getTvl();
        uint256 totalSupply = totalSupply();

        if (totalValue == 0 || totalSupply == 0) {
            return value.mul(DEFAULT_MAPT_TO_UNDERLYER_FACTOR);
        }

        return value.mul(totalSupply).div(totalValue);
    }
}
