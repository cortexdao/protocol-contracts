// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    SafeERC20 as SafeERC20UpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "./utils/AccessControl.sol";
import {
    IAssetAllocationRegistry
} from "./interfaces/IAssetAllocationRegistry.sol";
import {IAddressRegistryV2} from "./interfaces/IAddressRegistryV2.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SignedSafeMath} from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import {
    IDetailedERC20UpgradeSafe
} from "./interfaces/IDetailedERC20UpgradeSafe.sol";
import {ILpSafeFunder} from "./interfaces/ILpSafeFunder.sol";
import {ITvlManager} from "./interfaces/ITvlManager.sol";
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
    using SafeERC20UpgradeSafe for IDetailedERC20UpgradeSafe;

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
    function setAddressRegistry(address addressRegistry_)
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
        PoolAmount[] memory rebalanceAmounts = getRebalanceAmounts(poolIds);
        _rebalanceReserves(rebalanceAmounts);
    }

    /**
     * @notice This will transfer specified amounts between pool(s) and LP Safe.
     *         Uses the same sign convention as in `getRebalanceAmounts`.
     * @dev LP Safe must approve the Pool Manager for transfers.
     *      Will throw if not called by role-permissioned address.
     * @param rebalanceAmounts array of PoolAmount structs
     */
    function emergencyRebalanceReserves(
        ILpSafeFunder.PoolAmount[] calldata rebalanceAmounts
    ) external override nonReentrant onlyEmergencyRole {
        _rebalanceReserves(rebalanceAmounts);
    }

    function _rebalanceReserves(PoolAmount[] memory rebalanceAmounts) internal {
        address lpSafeAddress = addressRegistry.lpSafeAddress();
        require(lpSafeAddress != address(0), "INVALID_LP_SAFE"); // defensive check -- should never happen

        (PoolTokenV2[] memory pools, int256[] memory amounts) =
            _getPoolsAndAmounts(rebalanceAmounts);

        _deployOrUnwindCapital(lpSafeAddress, pools, amounts);
        _registerPoolUnderlyers(lpSafeAddress, pools);
    }

    /**
     * @notice Returns the (signed) top-up amount for each pool ID given.
     *         A positive (negative) sign means the reserve level is in
     *         deficit (excess) of required percentage.
     * @param poolIds array of pool identifiers
     * @return array of structs holding pool ID and signed amount
     */
    function getRebalanceAmounts(bytes32[] memory poolIds)
        public
        view
        returns (PoolAmount[] memory)
    {
        PoolAmount[] memory rebalanceAmounts = new PoolAmount[](poolIds.length);

        for (uint256 i = 0; i < poolIds.length; i++) {
            rebalanceAmounts[i] = PoolAmount(
                poolIds[i],
                PoolTokenV2(addressRegistry.getAddress(poolIds[i]))
                    .getReserveTopUpValue()
            );
        }

        return rebalanceAmounts;
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }

    /**
     * @notice Register an asset allocation for the account with each pool underlyer
     * @param account address of the registered account
     * @param pools list of pools whose underlyers will be registered
     */
    function _registerPoolUnderlyers(
        address account,
        PoolTokenV2[] memory pools
    ) internal {
        ITvlManager tvlManager =
            ITvlManager(addressRegistry.getAddress("tvlManager"));
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            IDetailedERC20UpgradeSafe underlyer = pool.underlyer();
            string memory symbol = underlyer.symbol();
            bytes memory _data =
                abi.encodeWithSignature("balanceOf(address)", account);
            ITvlManager.Data memory data =
                ITvlManager.Data(address(pool.underlyer()), _data);
            if (!tvlManager.isAssetAllocationRegistered(data)) {
                tvlManager.addAssetAllocation(
                    data,
                    symbol,
                    underlyer.decimals()
                );
            }
        }
    }

    /**
     * @dev Transfers underlyer between pool and account while doing
     *      a corresponding mAPT mint or burn.  Note no transfer occurs
     *      when the mint/burn amount is zero.
     */
    function _deployOrUnwindCapital(
        address account,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) internal {
        require(account != address(0), "INVALID_ADDRESS");
        require(pools.length == amounts.length, "LENGTHS_MUST_MATCH");

        MetaPoolToken mApt = MetaPoolToken(addressRegistry.mAptAddress());
        int256[] memory mAptDeltas = _calculateMaptDeltas(mApt, pools, amounts);

        // MUST do the actual minting after calculating *all* mint amounts,
        // otherwise due to Chainlink not updating during a transaction,
        // the totalSupply will change while TVL doesn't.
        //
        // Using the pre-mint TVL and totalSupply gives the same answer
        // as using post-mint values.
        for (uint256 i = 0; i < pools.length; i++) {
            int256 delta = mAptDeltas[i];

            PoolTokenV2 pool = pools[i];

            if (delta < 0) {
                mApt.mint(address(pool), uint256(-delta));
            } else if (delta > 0) {
                mApt.burn(address(pool), uint256(delta));
            } else {
                continue;
            }

            //NOTE: negative amount Pool to LPSafe; positive amount LpSafe to Pool
            int256 transferAmount = amounts[i];
            if (transferAmount < 0) {
                pool.transferToLPSafe(uint256(transferAmount.mul(-1)));
            } else {
                IDetailedERC20UpgradeSafe underlyer = pool.underlyer();
                underlyer.safeTransferFrom(
                    account,
                    address(pool),
                    uint256(transferAmount)
                );
            }
        }
    }

    /**
     * @dev Calculates the mAPT mint/burn amounts for each given pool
     *      and underlyer amount.
     */
    function _calculateMaptDeltas(
        MetaPoolToken mApt,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) internal view returns (int256[] memory) {
        require(pools.length == amounts.length, "LENGTHS_MUST_MATCH");

        int256[] memory mAptDeltas = new int256[](pools.length);

        for (uint256 i = 0; i < pools.length; i++) {
            int256 amountSign;

            if (amounts[i] < 0) {
                amountSign = int256(-1);
            } else if (amounts[i] > 0) {
                amountSign = int256(1);
            } else {
                mAptDeltas[i] = 0;
                continue;
            }

            IDetailedERC20UpgradeSafe underlyer = pools[i].underlyer();
            uint256 tokenPrice = pools[i].getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();

            uint256 mAptDelta =
                mApt.calculateMintAmount(
                    uint256(amounts[i].mul(amountSign)),
                    tokenPrice,
                    decimals
                );

            mAptDeltas[i] = int256(mAptDelta).mul(amountSign);
        }

        return mAptDeltas;
    }

    /// @dev convenience function to destructure PoolAmount structs
    function _getPoolsAndAmounts(ILpSafeFunder.PoolAmount[] memory poolAmounts)
        internal
        view
        returns (PoolTokenV2[] memory, int256[] memory)
    {
        PoolTokenV2[] memory pools = new PoolTokenV2[](poolAmounts.length);
        int256[] memory amounts = new int256[](poolAmounts.length);
        for (uint256 i = 0; i < poolAmounts.length; i++) {
            amounts[i] = poolAmounts[i].amount;
            pools[i] = PoolTokenV2(
                addressRegistry.getAddress(poolAmounts[i].poolId)
            );
        }
        return (pools, amounts);
    }
}
