// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";
import {
    Initializable,
    ERC20UpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    AccessControlUpgradeSafe,
    Address as AddressUpgradeSafe,
    SafeMath as SafeMathUpgradeSafe,
    SignedSafeMath as SignedSafeMathUpgradeSafe
} from "contracts/proxy/Imports.sol";
import {ILpAccount} from "contracts/lpaccount/Imports.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {ILockingOracle} from "contracts/oracle/Imports.sol";
import {IReservePool} from "contracts/pool/Imports.sol";
import {
    IErc20Allocation,
    IAssetAllocationRegistry,
    Erc20AllocationConstants
} from "contracts/tvl/Imports.sol";

import {ILpAccountFunder} from "./ILpAccountFunder.sol";

/**
 * @notice This contract has hybrid functionality:
 *
 * - It acts as a token that tracks the capital that has been pulled
 * ("deployed") from APY Finance pools (PoolToken contracts)
 *
 * - It is permissioned to transfer funds between the pools and the
 * LP Account contract.
 *
 * @dev When MetaPoolToken pulls capital from the pools to the LP Account, it
 * will mint mAPT for each pool. Conversely, when MetaPoolToken withdraws funds
 * from the LP Account to the pools, it will burn mAPT for each pool.
 *
 * The ratio of each pool's mAPT balance to the total mAPT supply determines
 * the amount of the TVL dedicated to the pool.
 *
 *
 * DEPLOY CAPITAL TO YIELD FARMING STRATEGIES
 * Mints appropriate mAPT amount to track share of deployed TVL owned by a pool.
 *
 * +-------------+  MetaPoolToken.fundLpAccount  +-----------+
 * |             |------------------------------>|           |
 * | PoolTokenV2 |     MetaPoolToken.mint        | LpAccount |
 * |             |<------------------------------|           |
 * +-------------+                               +-----------+
 *
 *
 * WITHDRAW CAPITAL FROM YIELD FARMING STRATEGIES
 * Uses mAPT to calculate the amount of capital returned to the PoolToken.
 *
 * +-------------+  MetaPoolToken.withdrawFromLpAccount  +-----------+
 * |             |<--------------------------------------|           |
 * | PoolTokenV2 |          MetaPoolToken.burn           | LpAccount |
 * |             |-------------------------------------->|           |
 * +-------------+                                       +-----------+
 */
contract LpAccountFunder is ReentrancyGuard {
    using Address for address;
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    /** @notice used to protect mint and burn function */
    IAddressRegistryV2 public addressRegistry;

    /* ------------------------------- */

    event AddressRegistryChanged(address);

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
    constructor(address addressRegistry_) public {
        _setAddressRegistry(addressRegistry_);
        _setupRole(DEFAULT_ADMIN_ROLE, addressRegistry.emergencySafeAddress());
        _setupRole(LP_ROLE, addressRegistry.lpSafeAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.emergencySafeAddress());
    }

    /**
     * @notice Sets the address registry
     * @param addressRegistry_ the address of the registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        nonReentrant
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    function fundLpAccount() external override nonReentrant onlyLpRole {
        (IReservePool[] memory pools, int256[] memory amounts) =
            getRebalanceAmounts(poolIds);

        uint256[] memory fundAmounts = _getFundAmounts(amounts);

        _fundLpAccount(pools, fundAmounts);

        emit FundLpAccount(poolIds, fundAmounts);
    }

    function withdrawFromLpAccount(bytes32[] calldata poolIds)
        external
        override
        nonReentrant
        onlyLpRole
    {
        (IReservePool[] memory pools, int256[] memory topupAmounts) =
            getRebalanceAmounts(poolIds);

        uint256[] memory lpAccountBalances = getLpAccountBalances(poolIds);
        uint256[] memory withdrawAmounts =
            _calculateAmountsToWithdraw(topupAmounts, lpAccountBalances);

        _withdrawFromLpAccount(pools, withdrawAmounts);
        emit WithdrawFromLpAccount(poolIds, withdrawAmounts);
    }

    /**
     * @notice Returns the (signed) top-up amount for each pool ID given.
     * A positive (negative) sign means the reserve level is in deficit
     * (excess) of required percentage.
     * @return An array of rebalance amounts
     */
    function getRebalanceAmount() public view returns (int256 rebalanceAmount) {
        rebalanceAmount = IReservePool(indexToken).getReserveTopUpValue();
    }

    function getLpAccountBalance()
        public
        view
        returns (uint256 lpAccountBalance)
    {
        IReservePool pool = IReservePool(indexToken);
        IDetailedERC20 underlyer = IDetailedERC20(pool.underlyer());

        address lpAccountAddress = addressRegistry.lpAccountAddress();
        lpAccountBalance = underlyer.balanceOf(lpAccountAddress);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }

    function _fundLpAccount(uint256 amount) internal {
        address lpAccountAddress = addressRegistry.lpAccountAddress();
        require(lpAccountAddress != address(0), "INVALID_LP_ACCOUNT"); // defensive check -- should never happen

        IReservePool(indexToik).transferToLpAccount(amount);

        ILockingOracle oracleAdapter = _getOracleAdapter();
        oracleAdapter.lock();
    }

    /**
     * @dev Transfer the specified amounts to pools, doing mAPT burns,
     * and checking the transferred tokens have been registered.
     */
    function _withdrawFromLpAccount(uint256 amount) internal {
        address lpAccount = addressRegistry.lpAccountAddress();
        ILpAccount(lpAccount).transferToPool(indexToken, amount);

        ILockingOracle oracleAdapter = _getOracleAdapter();
        oracleAdapter.lock();
    }

    /**
     * @notice Register an asset allocation for the account with each pool underlyer
     * @param pools list of pool amounts whose pool underlyers will be registered
     */
    function _registerPoolUnderlyers(IReservePool[] memory pools) internal {
        IAssetAllocationRegistry tvlManager =
            IAssetAllocationRegistry(addressRegistry.getAddress("tvlManager"));
        IErc20Allocation erc20Allocation =
            IErc20Allocation(
                address(
                    tvlManager.getAssetAllocation(Erc20AllocationConstants.NAME)
                )
            );

        for (uint256 i = 0; i < pools.length; i++) {
            IDetailedERC20 underlyer =
                IDetailedERC20(address(pools[i].underlyer()));

            if (!erc20Allocation.isErc20TokenRegistered(underlyer)) {
                erc20Allocation.registerErc20Token(underlyer);
            }
        }
    }

    function _getOracleAdapter() internal view returns (ILockingOracle) {
        address oracleAdapterAddress = addressRegistry.oracleAdapterAddress();
        return ILockingOracle(oracleAdapterAddress);
    }

    function _calculateDeltas(
        IReservePool[] memory pools,
        uint256[] memory amounts
    ) internal view returns (uint256[] memory) {
        require(pools.length == amounts.length, "LENGTHS_MUST_MATCH");
        uint256[] memory deltas = new uint256[](pools.length);

        for (uint256 i = 0; i < pools.length; i++) {
            IReservePool pool = pools[i];
            uint256 amount = amounts[i];

            IDetailedERC20 underlyer = pool.underlyer();
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
        uint256 totalValue = _getTvl();
        uint256 totalSupply = totalSupply();

        if (totalValue == 0 || totalSupply == 0) {
            return value.mul(DEFAULT_MAPT_TO_UNDERLYER_FACTOR);
        }

        return value.mul(totalSupply).div(totalValue);
    }

    function _getFundAmounts(int256[] memory amounts)
        internal
        pure
        returns (uint256[] memory)
    {
        uint256[] memory fundAmounts = new uint256[](amounts.length);

        for (uint256 i = 0; i < amounts.length; i++) {
            int256 amount = amounts[i];

            fundAmounts[i] = amount < 0 ? uint256(-amount) : 0;
        }

        return fundAmounts;
    }

    /**
     * @dev Calculate amounts used for topup, taking into
     * account the available LP Account balances.
     */
    function _calculateAmountsToWithdraw(
        int256[] memory topupAmounts,
        uint256[] memory lpAccountBalances
    ) internal pure returns (uint256[] memory) {
        uint256[] memory withdrawAmounts = new uint256[](topupAmounts.length);
        for (uint256 i = 0; i < topupAmounts.length; i++) {
            int256 topupAmount = topupAmounts[i];

            uint256 withdrawAmount = topupAmount > 0 ? uint256(topupAmount) : 0;
            uint256 lpAccountBalance = lpAccountBalances[i];
            withdrawAmounts[i] = withdrawAmount > lpAccountBalance
                ? lpAccountBalance
                : withdrawAmount;
        }

        return withdrawAmounts;
    }
}
