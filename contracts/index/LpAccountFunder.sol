// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    AccessControl,
    IDetailedERC20,
    ReentrancyGuard
} from "contracts/common/Imports.sol";
import {
    Address,
    SafeERC20,
    SafeMath,
    SignedSafeMath
} from "contracts/libraries/Imports.sol";
import {ILpAccount} from "contracts/lpaccount/Imports.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {ILockingOracle} from "contracts/oracle/Imports.sol";
import {IERC4626, IReserveVault} from "contracts/index/Imports.sol";
import {
    IErc20Allocation,
    IAssetAllocationRegistry,
    Erc20AllocationConstants
} from "contracts/tvl/Imports.sol";

/**
 * @notice This contract is permissioned to transfer funds between the vault
 * and the LP Account contract.
 */
contract LpAccountFunder is
    AccessControl,
    ReentrancyGuard,
    Erc20AllocationConstants
{
    using Address for address;
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeERC20 for IDetailedERC20;

    IAddressRegistryV2 public addressRegistry;
    address public indexToken;

    /* ------------------------------- */

    event AddressRegistryChanged(address);
    event IndexTokenChanged(address);
    event FundLpAccount(uint256);
    event WithdrawFromLpAccount(uint256);

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
    constructor(address addressRegistry_, address indexToken_) public {
        _setIndexToken(indexToken_);
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

    function fundLpAccount() external nonReentrant onlyLpRole {
        int256 amount = getRebalanceAmount();
        uint256 fundAmount = _getFundAmount(amount);

        _fundLpAccount(fundAmount);
        _registerPoolUnderlyer();

        emit FundLpAccount(fundAmount);
    }

    function withdrawFromLpAccount() external nonReentrant onlyLpRole {
        int256 topupAmount = getRebalanceAmount();

        uint256 lpAccountBalance = getLpAccountBalance();
        uint256 withdrawAmount =
            _calculateAmountToWithdraw(topupAmount, lpAccountBalance);

        _withdrawFromLpAccount(withdrawAmount);
        emit WithdrawFromLpAccount(withdrawAmount);
    }

    /**
     * @notice Returns the (signed) top-up amount for each pool ID given.
     * A positive (negative) sign means the reserve level is in deficit
     * (excess) of required percentage.
     * @return rebalanceAmount
     */
    function getRebalanceAmount() public view returns (int256 rebalanceAmount) {
        rebalanceAmount = IReserveVault(indexToken).getReserveTopUpValue();
    }

    function getLpAccountBalance()
        public
        view
        returns (uint256 lpAccountBalance)
    {
        IERC4626 vault = IERC4626(indexToken);
        IDetailedERC20 asset = IDetailedERC20(vault.asset());

        address lpAccountAddress = addressRegistry.lpAccountAddress();
        lpAccountBalance = asset.balanceOf(lpAccountAddress);
    }

    function _setAddressRegistry(address addressRegistry_) internal {
        require(addressRegistry_.isContract(), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistryV2(addressRegistry_);
        emit AddressRegistryChanged(addressRegistry_);
    }

    function _setIndexToken(address indexToken_) internal {
        require(indexToken_.isContract(), "INVALID_ADDRESS");
        indexToken = indexToken_;
        emit IndexTokenChanged(indexToken_);
    }

    function _fundLpAccount(uint256 amount) internal {
        address lpAccountAddress = addressRegistry.lpAccountAddress();
        require(lpAccountAddress != address(0), "INVALID_LP_ACCOUNT"); // defensive check -- should never happen

        IReserveVault(indexToken).transferToLpAccount(amount);

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
     */
    function _registerPoolUnderlyer() internal {
        IAssetAllocationRegistry tvlManager =
            IAssetAllocationRegistry(addressRegistry.getAddress("tvlManager"));
        IErc20Allocation erc20Allocation =
            IErc20Allocation(
                address(
                    tvlManager.getAssetAllocation(Erc20AllocationConstants.NAME)
                )
            );

        IERC4626 vault = IERC4626(indexToken);
        IDetailedERC20 asset = IDetailedERC20(vault.asset());

        if (!erc20Allocation.isErc20TokenRegistered(asset)) {
            erc20Allocation.registerErc20Token(asset);
        }
    }

    function _getOracleAdapter() internal view returns (ILockingOracle) {
        address oracleAdapterAddress = addressRegistry.oracleAdapterAddress();
        return ILockingOracle(oracleAdapterAddress);
    }

    function _getFundAmount(int256 amount)
        internal
        pure
        returns (uint256 fundAmount)
    {
        fundAmount = amount < 0 ? uint256(-amount) : 0;
    }

    /**
     * @dev Calculate amounts used for topup, taking into
     * account the available LP Account balances.
     */
    function _calculateAmountToWithdraw(
        int256 topupAmount,
        uint256 lpAccountBalance
    ) internal pure returns (uint256 withdrawAmount) {
        withdrawAmount = topupAmount > 0 ? uint256(topupAmount) : 0;
        withdrawAmount = withdrawAmount > lpAccountBalance
            ? lpAccountBalance
            : withdrawAmount;
    }
}
