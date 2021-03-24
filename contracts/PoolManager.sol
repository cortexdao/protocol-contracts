// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IAccountFunder.sol";
import "./interfaces/IAccountFactory.sol";
import "./interfaces/ITVLManager.sol";
import "./PoolTokenV2.sol";
import "./MetaPoolToken.sol";
import "./Account.sol";

/**
 * @title Pool Manager
 * @author APY.Finance
 * @notice This is the pool manager logic contract for use with the pool manager proxy contract.
 *
 * The Pool Manager orchestrates the movement of capital within the APY system
 * between the PoolTokens and Accounts.
 *
 * Transferring from the PoolToken contracts to the Account contract stages
 * capital for deployment before yield farming strategies are executed.
 *
 * Capital unwound from yield farming strategies for user withdrawals is transferred from the
 * Account contract to the PoolToken contracts.
 *
 * When funding an account, the Pool Manager simultaneously register the account
 * with the TVL Manager for the undelerying token pool to ensure the TVL is properly updated
 */
contract PoolManager is Initializable, OwnableUpgradeSafe, IAccountFunder {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    MetaPoolToken public mApt;
    IAddressRegistry public addressRegistry;
    IAccountFactory public accountFactory;
    bytes32[] internal _poolIds;

    /* ------------------------------- */

    event AdminChanged(address);

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
     * @param _mApt the metapool token to initialize with
     * @param _addressRegistry the address registry to initialize with
     */
    function initialize(
        address adminAddress,
        address payable _mApt,
        address _addressRegistry
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        mApt = MetaPoolToken(_mApt);
        addressRegistry = IAddressRegistry(_addressRegistry);
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
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /// @notice Sets the proxy admin address of the pool manager proxy
    /// @dev only callable by owner
    /// @param address the new proxy admin address of the pool manager
    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    /// @notice Sets the metapool token address
    /// @dev only callable by owner
    /// @param address the address of the metapool token
    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        mApt = MetaPoolToken(_mApt);
    }

    /// @notice Sets the address registry
    /// @dev only callable by owner
    /// @param address the address of the registry
    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    /// @notice Sets the new account factory
    /// @dev only callable by owner
    /// @param address the address of the account factory
    function setAccountFactory(address _accountFactory) public onlyOwner {
        require(Address.isContract(_accountFactory), "INVALID_ADDRESS");
        accountFactory = IAccountFactory(_accountFactory);
    }

    /**
     * @notice Funds Account and register an asset allocation
     * @dev only callable by owner. Also registers the pool underlyer for the account being funded
     * @param accountId id of the Account being funded
     * @param poolAmounts a list of PoolAmount structs denoting the pools id and amounts that will be used to fund the account
     * @notice PoolAmount example (pulls ~$1 from each pool to the Account):
     *      [
     *          { poolId: "daiPool", amount: "1000000000000" },
     *          { poolId: "usdcPool", amount: "1000000" },
     *          { poolId: "usdtPool", amount: "1000000" },
     *      ]
     */
    function fundAccount(
        bytes32 accountId,
        IAccountFunder.PoolAmount[] memory poolAmounts
    ) external override onlyOwner {
        address accountAddress = accountFactory.getAccount(accountId);
        require(accountAddress != address(0), "INVALID_ACCOUNT");
        (PoolTokenV2[] memory pools, uint256[] memory amounts) =
            _getPoolsAndAmounts(poolAmounts);
        _registerPoolUnderlyers(accountAddress, pools);
        _fundAccount(accountAddress, pools, amounts);
    }

    function _getPoolsAndAmounts(IAccountFunder.PoolAmount[] memory poolAmounts)
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

    /// @notice Helper function to register a pool's underlyer balanceOf method for an account, when the account is funded
    /// @param account the address of the account that will be registered with the balanceOf method
    /// @param pools a list of pools that need their underlyer balanceOf method registered with the provided account being funded
    function _registerPoolUnderlyers(
        address account,
        PoolTokenV2[] memory pools
    ) internal {
        ITVLManager tvlManager =
            ITVLManager(addressRegistry.getAddress("chainlinkRegistry"));
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            IDetailedERC20 underlyer = pool.underlyer();
            string memory symbol = underlyer.symbol();
            bytes memory _data =
                abi.encodeWithSignature("balanceOf(address)", account);
            ITVLManager.Data memory data =
                ITVLManager.Data(address(pool.underlyer()), _data);
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
     * @notice Helper function move capital from PoolToken contracts to an Account
     * @param account the address to move funds to
     * @param pools a list of pools to pull funds from
     * @param amounts a list of fund amounts to pull from pools
     */
    function _fundAccount(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal {
        uint256[] memory mintAmounts = new uint256[](pools.length);
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            uint256 poolAmount = amounts[i];
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
     * @notice Moves capital from an Account to the PoolToken contracts
     * @dev only callable by owner
     * @param accountId the account id to withdraw funds from
     * @param poolAmounts a list of PoolAmount structs denoting the pools id and amounts that will deposited back into the pools
     * @notice PoolAmount example (pushes ~$1 to each pool from the Account):
     *      [
     *          { poolId: "daiPool", amount: "1000000000000" },
     *          { poolId: "usdcPool", amount: "1000000" },
     *          { poolId: "usdtPool", amount: "1000000" },
     *      ]
     */
    function withdrawFromAccount(
        bytes32 accountId,
        IAccountFunder.PoolAmount[] memory poolAmounts
    ) external override onlyOwner {
        address accountAddress = accountFactory.getAccount(accountId);
        require(accountAddress != address(0), "INVALID_ACCOUNT");
        (PoolTokenV2[] memory pools, uint256[] memory amounts) =
            _getPoolsAndAmounts(poolAmounts);
        _checkManagerAllowances(accountAddress, pools, amounts);
        _withdrawFromAccount(accountAddress, pools, amounts);
    }

    /// @notice helper function to check if the pool manager has sufficient allowance to transfer
    /// the pool's underlyer from the provided account
    /// @param account the address of the account to check
    /// @param pools the list of pools to transfer funds to; used for retrieving the underlyer
    /// @param amounts the list of allowance amounts the manager needs to have in order to successfully transfer from an account
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

    /**
     * @notice Move capital from an Account back to the PoolToken contracts
     * @param account account that funds are being withdrawn from
     * @param pools a list of pools to place recovered funds back into
     * @param amounts a list of amounts to send from the account to the pools
     *
     */
    function _withdrawFromAccount(
        address account,
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) internal {
        uint256[] memory burnAmounts = new uint256[](pools.length);
        for (uint256 i = 0; i < pools.length; i++) {
            PoolTokenV2 pool = pools[i];
            uint256 amountToSend = amounts[i];
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

    /// @notice Returns a list of all the pool ids
    /// @return bytes32 list of pool ids
    function getPoolIds() public view returns (bytes32[] memory) {
        return _poolIds;
    }

    /// @notice Sets a list of pool ids
    /// @dev only callable by owner. overwrites prior list of pool ids
    /// @param poolIds the new list of pool ids
    function setPoolIds(bytes32[] memory poolIds) public onlyOwner {
        _poolIds = poolIds;
    }

    /// @notice Removes the list of pool ids
    /// @dev only callable by owner. removes all pool ids
    function deletePoolIds() external onlyOwner {
        delete _poolIds;
    }
}
