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
import {IAssetAllocation} from "./interfaces/IAssetAllocation.sol";
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
 * @notice The pool manager logic contract for use with the pool manager proxy contract.
 *
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
     * @dev Since the proxy delegate calls to this "logic" contract, any
     * storage set by the logic contract's constructor during deploy is
     * disregarded and this function is needed to initialize the proxy
     * contract's storage according to this contract's layout.
     *
     * Since storage is not set yet, there is no simple way to protect
     * calling this function with owner modifiers.  Thus the OpenZeppelin
     * `initializer` modifier protects this function from being called
     * repeatedly.
     *
     * Our proxy deployment will call this as part of the constructor.
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

    function rebalanceReserves(bytes32[] calldata poolIds)
        external
        override
        nonReentrant
        onlyLpRole
    {
        address lpSafeAddress = addressRegistry.lpSafeAddress();
        require(lpSafeAddress != address(0), "INVALID_LP_SAFE");

        PoolAmount[] memory rebalanceAmounts = _getRebalanceAmounts(poolIds);

        (PoolTokenV2[] memory pools, int256[] memory amounts) =
            _getPoolsAndAmounts(rebalanceAmounts);

        _rebalance(lpSafeAddress, pools, amounts);
        _registerPoolUnderlyers(lpSafeAddress, pools);
    }

    function emergencyRebalanceReserves(
        ILpSafeFunder.PoolAmount[] calldata rebalanceAmounts
    ) external override nonReentrant onlyEmergencyRole {
        address lpSafeAddress = addressRegistry.lpSafeAddress();
        require(lpSafeAddress != address(0), "INVALID_LP_SAFE");

        (PoolTokenV2[] memory pools, int256[] memory amounts) =
            _getPoolsAndAmounts(rebalanceAmounts);

        _rebalance(lpSafeAddress, pools, amounts);
        _registerPoolUnderlyers(lpSafeAddress, pools);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(Address.isContract(addressRegistry_), "INVALID_ADDRESS");
        require(addressRegistry_ != address(0), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable with emergencyRole
     * @param addressRegistry_ the address of the registry
     */
    function setAddressRegistry(address addressRegistry_)
        public
        onlyEmergencyRole
    {
        _setAddressRegistry(addressRegistry_);
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

    function _rebalance(
        address account,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) internal {
        MetaPoolToken mApt = MetaPoolToken(addressRegistry.mAptAddress());

        int256[] memory mAptDeltas = _calculateMaptDeltas(mApt, pools, amounts);

        _transferBetweenAccountAndPools(account, pools, amounts);

        // MUST do the actual minting after calculating *all* mint amounts,
        // otherwise due to Chainlink not updating during a transaction,
        // the totalSupply will change while TVL doesn't.
        //
        // Using the pre-mint TVL and totalSupply gives the same answer
        // as using post-mint values.
        _rebalanceMapt(mApt, pools, mAptDeltas);
    }

    function _transferBetweenAccountAndPools(
        address account,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) internal {
        require(account != address(0), "INVALID_ADDRESS");
        require(pools.length == amounts.length, "LENGTHS_MUST_MATCH");

        for (uint256 i = 0; i < pools.length; i++) {
            require(amounts[i] != 0, "INVALID_AMOUNT");

            IDetailedERC20UpgradeSafe underlyer = pools[i].underlyer();

            (address from, address to, uint256 amount) =
                amounts[i] < 0
                    ? (address(pools[i]), account, uint256(-amounts[i]))
                    : (account, address(pools[i]), uint256(amounts[i]));

            underlyer.safeTransferFrom(from, to, amount);
        }
    }

    function _rebalanceMapt(
        MetaPoolToken mApt,
        PoolTokenV2[] memory pools,
        int256[] memory mAptDeltas
    ) internal {
        require(pools.length == mAptDeltas.length, "LENGTHS_MUST_MATCH");

        for (uint256 i = 0; i < pools.length; i++) {
            require(mAptDeltas[i] != 0, "INVALID_AMOUNT");

            if (mAptDeltas[i] < 0) {
                mApt.mint(address(pools[i]), uint256(-mAptDeltas[i]));
            } else if (mAptDeltas[i] > 0) {
                mApt.burn(address(pools[i]), uint256(mAptDeltas[i]));
            }
        }
    }

    function _getRebalanceAmounts(bytes32[] memory poolIds)
        internal
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

    function _calculateMaptDeltas(
        MetaPoolToken mApt,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) internal view returns (int256[] memory) {
        require(pools.length == amounts.length, "LENGTHS_MUST_MATCH");

        int256[] memory mAptDeltas = new int256[](pools.length);

        for (uint256 i = 0; i < pools.length; i++) {
            require(amounts[i] != 0, "INVALID_AMOUNT");

            IDetailedERC20UpgradeSafe underlyer = pools[i].underlyer();
            uint256 tokenPrice = pools[i].getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();

            int256 amountSign = amounts[i] < 0 ? int256(-1) : int256(1);

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
