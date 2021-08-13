// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "./utils/AccessControl.sol";
import {
    IAssetAllocationRegistry
} from "./interfaces/IAssetAllocationRegistry.sol";
import {ITvlManager} from "./interfaces/ITvlManager.sol";
import {
    IErc20AllocationRegistry
} from "./interfaces/IErc20AllocationRegistry.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SignedSafeMath} from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import {ILpSafeFunder} from "./interfaces/ILpSafeFunder.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";
import {MetaPoolToken} from "./MetaPoolToken.sol";

/**
 * @title Pool Manager
 * @author APY.Finance
 * @notice
 * The Pool Manager orchestrates the movement of capital within the APY system
 * between pools (PoolTokenV2 contracts) and strategy accounts, e.g. LP Safe.
 *
 * Transferring from a PoolToken to an account stages capital in preparation
 * for executing yield farming strategies.
 *
 * Capital is unwound from yield farming strategies for user withdrawals by transferring
 * from accounts to PoolTokens.
 *
 * When funding an account from a pool, the Pool Manager simultaneously register the asset
 * allocation with the TVL Manager to ensure the TVL is properly updated.
 */
contract PoolManager is AccessControl, ReentrancyGuard, ILpSafeFunder {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    IAddressRegistryV2 public addressRegistry;

    /**
     * @dev Access control roles are dynamic through the Address Registry.
     *      In the future, DEFAULT_ADMIN_ROLE will be the Address Registry itself,
     *      which will have functionality for granting and revoking roles.
     * @param addressRegistry_ the address registry to initialize with
     */
    constructor(address addressRegistry_) public {
        _setAddressRegistry(addressRegistry_);
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            addressRegistry.getAddress("emergencySafe")
        );
        _setupRole(LP_ROLE, addressRegistry.lpSafeAddress());
        _setupRole(EMERGENCY_ROLE, addressRegistry.getAddress("emergencySafe"));
    }

    /**
     * @notice Sets the address registry
     * @dev only callable with emergencyRole
     * @param addressRegistry_ the address of the registry
     */
    function emergencySetAddressRegistry(address addressRegistry_)
        external
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
    }

    /**
     * @notice Rebalances the pool reserve for each given pool ID so that
     *         it is the required percentage of the pool's deployed value.
     *         This will transfer funds between pool(s) and LP Safe.
     * @dev LP Safe must approve the Pool Manager for transfers.
     *      Will throw if not called by role-permissioned address.
     * @param poolIds array of pool identifiers
     */
    function rebalanceReserves(bytes32[] calldata poolIds)
        external
        override
        nonReentrant
        onlyLpRole
    {
        (
            PoolAmount[] memory depositAmounts,
            PoolAmount[] memory withdrawAmounts
        ) = getRebalanceAmounts(poolIds);
        _rebalanceReserves(depositAmounts, withdrawAmounts);
    }

    /**
     * @notice This will transfer specified amounts between pool(s) and LP Safe.
     *         Uses the same sign convention as in `getRebalanceAmounts`.
     * @dev LP Safe must approve the Pool Manager for transfers.
     *      Will throw if not called by role-permissioned address.
     * @param depositAmounts array of PoolAmount structs
     * @param withdrawAmounts array of PoolAmount structs
     */
    function emergencyRebalanceReserves(
        ILpSafeFunder.PoolAmount[] calldata depositAmounts,
        ILpSafeFunder.PoolAmount[] calldata withdrawAmounts
    ) external override nonReentrant onlyEmergencyRole {
        _rebalanceReserves(depositAmounts, withdrawAmounts);
    }

    function _rebalanceReserves(
        PoolAmount[] memory depositAmounts,
        PoolAmount[] memory withdrawAmounts
    ) internal {
        address lpSafeAddress = addressRegistry.lpSafeAddress();
        require(lpSafeAddress != address(0), "INVALID_LP_SAFE"); // defensive check -- should never happen

        MetaPoolToken mApt = MetaPoolToken(addressRegistry.mAptAddress());

        mApt.mint(depositAmounts);
        _registerPoolUnderlyers(depositAmounts);

        mApt.burn(withdrawAmounts);
        _registerPoolUnderlyers(withdrawAmounts);
    }

    /**
     * @notice Returns the (signed) top-up amount for each pool ID given.
     *         A positive (negative) sign means the reserve level is in
     *         deficit (excess) of required percentage.
     * @param poolIds array of pool identifiers
     * @return depositAmounts array of pool amounts that need to deposit
     * @return withdrawAmounts array of pool amounts that need to withdraw
     */
    function getRebalanceAmounts(bytes32[] memory poolIds)
        public
        view
        returns (
            PoolAmount[] memory depositAmounts,
            PoolAmount[] memory withdrawAmounts
        )
    {
        PoolTokenV2[] memory pools = new PoolTokenV2[](poolIds.length);
        int256[] memory rebalanceAmounts = new int256[](poolIds.length);

        uint256 depositCount = 0;
        uint256 withdrawCount = 0;

        for (uint256 i = 0; i < poolIds.length; i++) {
            PoolTokenV2 pool =
                PoolTokenV2(addressRegistry.getAddress(poolIds[i]));
            int256 rebalanceAmount = pool.getReserveTopUpValue();

            pools[i] = pool;
            rebalanceAmounts[i] = rebalanceAmount;

            if (rebalanceAmount < 0) {
                depositCount++;
            } else if (rebalanceAmount > 0) {
                withdrawCount++;
            }
        }

        (depositAmounts, withdrawAmounts) = _getRebalanceAmounts(
            pools,
            rebalanceAmounts,
            depositCount,
            withdrawCount
        );
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }

    /**
     * @notice Register an asset allocation for the account with each pool underlyer
     * @param poolAmounts list of pool amounts whose pool underlyers will be registered
     */
    function _registerPoolUnderlyers(PoolAmount[] memory poolAmounts) internal {
        ITvlManager tvlManager =
            ITvlManager(addressRegistry.getAddress("tvlManager"));
        IErc20AllocationRegistry erc20Registry =
            IErc20AllocationRegistry(tvlManager.erc20Allocation());

        for (uint256 i = 0; i < poolAmounts.length; i++) {
            address underlyer = address(poolAmounts[i].pool.underlyer());

            if (!erc20Registry.isErc20TokenRegistered(underlyer)) {
                erc20Registry.registerErc20Token(underlyer);
            }
        }
    }

    function _getRebalanceAmounts(
        PoolTokenV2[] memory pools,
        int256[] memory rebalanceAmounts,
        uint256 depositCount,
        uint256 withdrawCount
    )
        internal
        view
        returns (
            PoolAmount[] memory depositAmounts,
            PoolAmount[] memory withdrawAmounts
        )
    {
        depositAmounts = new PoolAmount[](depositCount);
        uint256 depositIndex = 0;

        withdrawAmounts = new PoolAmount[](withdrawCount);
        uint256 withdrawIndex = 0;

        for (uint256 j = 0; j < pools.length; j++) {
            PoolTokenV2 pool = pools[j];
            int256 rebalanceAmount = rebalanceAmounts[j];

            if (rebalanceAmount < 0) {
                depositAmounts[depositIndex] = PoolAmount(
                    pool,
                    uint256(-rebalanceAmount)
                );
                depositIndex++;
            } else if (rebalanceAmount > 0) {
                withdrawAmounts[withdrawIndex] = PoolAmount(
                    pool,
                    uint256(rebalanceAmount)
                );
                withdrawIndex++;
            }
        }
    }
}
