// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistryV2.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/ILpSafeFunder.sol";
import "./interfaces/ITvlManager.sol";
import "./PoolTokenV2.sol";
import "./MetaPoolToken.sol";

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
contract PoolManager is
    Initializable,
    AccessControlUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    ILpSafeFunder
{
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    bytes32 public constant LP_ROLE = keccak256("LP_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    IAddressRegistryV2 public addressRegistry;

    /* ------------------------------- */

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
     * repeatedly.
     *
     * Our proxy deployment will call this as part of the constructor.
     * @param adminAddress the admin proxy to initialize with
     * @param addressRegistry_ the address registry to initialize with
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

        _setupRole(ADMIN_ROLE, addressRegistry_.getAddress("adminSafe"));
        _setupRole(
            EMERGENCY_ROLE,
            addressRegistry_.getAddress("emergencySafe")
        );

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        setAddressRegistry(addressRegistry_);
    }

    /**
     * @notice Initialize the new logic in V2 when upgrading from V1.
     * @dev The `onlyAdmin` modifier prevents this function from being called
     * multiple times, because the call has to come from the ProxyAdmin contract
     * and it can only call this during its `upgradeAndCall` function.
     *
     * Note the `initializer` modifier can only be used once in the entire
     * contract, so we can't use it here.
     */
    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    /**
     * @notice Funds LP Safe account and register an asset allocation
     * @dev only callable by owner. Also registers the pool underlyer for the account being funded
     * @param poolAmounts a list of PoolAmount structs denoting the pools id and amounts used to fund the account
     * @notice PoolAmount example (pulls ~$1 from each pool to the account):
     *      [
     *          { poolId: "daiPool", amount: "1000000000000" },
     *          { poolId: "usdcPool", amount: "1000000" },
     *          { poolId: "usdtPool", amount: "1000000" },
     *      ]
     */
    function fundLpSafe(ILpSafeFunder.PoolAmount[] memory poolAmounts)
        external
        override
        nonReentrant
    {
        require(hasRole(LP_ROLE, msg.sender), "INVALID_ACCESS_CONTROL");
        address lpSafeAddress = addressRegistry.lpSafeAddress();
        require(lpSafeAddress != address(0), "INVALID_LP_SAFE");
        (PoolTokenV2[] memory pools, uint256[] memory amounts) =
            _getPoolsAndAmounts(poolAmounts);
        _fund(lpSafeAddress, pools, amounts);
        _registerPoolUnderlyers(lpSafeAddress, pools);
    }

    /**
     * @notice Moves capital from LP Safe account to the PoolToken contracts
     * @dev only callable by owner
     * @param poolAmounts list of PoolAmount structs denoting pool IDs and pool deposit amounts
     * @notice PoolAmount example (pushes ~$1 to each pool from the account):
     *      [
     *          { poolId: "daiPool", amount: "1000000000000" },
     *          { poolId: "usdcPool", amount: "1000000" },
     *          { poolId: "usdtPool", amount: "1000000" },
     *      ]
     */
    function withdrawFromLpSafe(ILpSafeFunder.PoolAmount[] memory poolAmounts)
        external
        override
        nonReentrant
    {
        require(hasRole(LP_ROLE, msg.sender), "INVALID_ACCESS_CONTROL");
        address lpSafeAddress = addressRegistry.lpSafeAddress();
        require(lpSafeAddress != address(0), "INVALID_LP_SAFE");
        (PoolTokenV2[] memory pools, uint256[] memory amounts) =
            _getPoolsAndAmounts(poolAmounts);
        _checkManagerAllowances(lpSafeAddress, pools, amounts);
        _withdraw(lpSafeAddress, pools, amounts);
    }

    /**
     * @notice Sets the proxy admin address of the pool manager proxy
     * @dev only callable by owner
     * @param adminAddress the new proxy admin address of the pool manager
     */
    function setAdminAddress(address adminAddress) public {
        require(hasRole(EMERGENCY_ROLE, msg.sender), "INVALID_ACCESS_CONTROL");
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /**
     * @notice Sets the address registry
     * @dev only callable by owner
     * @param addressRegistry_ the address of the registry
     */
    function setAddressRegistry(address addressRegistry_) public {
        require(hasRole(EMERGENCY_ROLE, msg.sender), "INVALID_ACCESS_CONTROL");
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
            IDetailedERC20 underlyer = pool.underlyer();
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
     * @notice Helper function move capital from PoolToken contracts to an account
     * @param account the address to move funds to
     * @param pools a list of pools to pull funds from
     * @param amounts a list of fund amounts to pull from pools
     */
    function _fund(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal {
        MetaPoolToken mApt = MetaPoolToken(addressRegistry.mAptAddress());
        uint256[] memory mintAmounts = new uint256[](pools.length);
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            uint256 poolAmount = amounts[i];
            require(poolAmount > 0, "INVALID_AMOUNT");
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 mintAmount =
                mApt.calculateMintAmount(poolAmount, tokenPrice, decimals);
            mintAmounts[i] = mintAmount;

            underlyer.safeTransferFrom(address(pool), account, poolAmount);
        }
        // MUST do the actual minting after calculating *all* mint amounts,
        // otherwise due to Chainlink not updating during a transaction,
        // the totalSupply will change while TVL doesn't.
        //
        // Using the pre-mint TVL and totalSupply gives the same answer
        // as using post-mint values.
        for (uint256 i = 0; i < pools.length; i++) {
            mApt.mint(address(pools[i]), mintAmounts[i]);
        }
    }

    /**
     * @notice Move capital from an account back to the PoolToken contracts
     * @param account account that funds are being withdrawn from
     * @param pools a list of pools to place recovered funds back into
     * @param amounts a list of amounts to send from the account to the pools
     *
     */
    function _withdraw(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal {
        MetaPoolToken mApt = MetaPoolToken(addressRegistry.mAptAddress());
        uint256[] memory burnAmounts = new uint256[](pools.length);
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            uint256 amountToSend = amounts[i];
            require(amountToSend > 0, "INVALID_AMOUNT");
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 burnAmount =
                mApt.calculateMintAmount(amountToSend, tokenPrice, decimals);
            burnAmounts[i] = burnAmount;

            underlyer.safeTransferFrom(account, address(pool), amountToSend);
        }
        // MUST do the actual burning after calculating *all* burn amounts,
        // otherwise due to Chainlink not updating during a transaction,
        // the totalSupply will change while TVL doesn't.
        //
        // Using the pre-burn TVL and totalSupply gives the same answer
        // as using post-burn values.
        for (uint256 i = 0; i < pools.length; i++) {
            mApt.burn(address(pools[i]), burnAmounts[i]);
        }
    }

    function _getPoolsAndAmounts(ILpSafeFunder.PoolAmount[] memory poolAmounts)
        internal
        view
        returns (PoolTokenV2[] memory, uint256[] memory)
    {
        PoolTokenV2[] memory pools = new PoolTokenV2[](poolAmounts.length);
        uint256[] memory amounts = new uint256[](poolAmounts.length);
        for (uint256 i = 0; i < poolAmounts.length; i++) {
            amounts[i] = poolAmounts[i].amount;
            pools[i] = PoolTokenV2(
                addressRegistry.getAddress(poolAmounts[i].poolId)
            );
        }
        return (pools, amounts);
    }

    /**
     * @notice Check if pool manager has sufficient allowance to transfer pool underlyer from account
     * @param account the address of the account to check
     * @param pools list of pools to transfer funds to; used for retrieving the underlyer
     * @param amounts list of required minimal allowances needed by the manager
     */
    function _checkManagerAllowances(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal view {
        for (uint256 i = 0; i < pools.length; i++) {
            IDetailedERC20 underlyer = pools[i].underlyer();
            uint256 allowance = underlyer.allowance(account, address(this));
            require(amounts[i] <= allowance, "INSUFFICIENT_ALLOWANCE");
        }
    }
}
