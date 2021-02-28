// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/EnumerableSet.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IStrategyFactory.sol";
import "./APYPoolTokenV2.sol";
import "./APYMetaPoolToken.sol";
import "./Strategy.sol";

contract APYManagerV2 is Initializable, OwnableUpgradeSafe, IStrategyFactory {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    // V1
    address public proxyAdmin;
    IAddressRegistry public addressRegistry;
    APYMetaPoolToken public mApt;

    bytes32[] internal _poolIds;
    // Replacing this last V1 storage slot is ok:
    // address[] internal _tokenAddresses;
    // WARNING: to be safe, we should use `deleteTokenAddresses`
    // before the V2 upgrade
    EnumerableSet.AddressSet internal _tokenAddresses;

    // V2
    mapping(bytes32 => address) public getStrategy;
    mapping(address => bool) public override isStrategyDeployed;

    mapping(address => EnumerableSet.AddressSet) internal _strategyToTokens;
    mapping(address => EnumerableSet.AddressSet) internal _tokenToStrategies;
    /* ------------------------------- */

    event AdminChanged(address);
    event StrategyDeployed(address strategy, address generalExecutor);

    function initialize(address adminAddress) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function deployStrategy(address generalExecutor)
        external
        override
        onlyOwner
        returns (address)
    {
        Strategy strategy = new Strategy(generalExecutor);
        isStrategyDeployed[address(strategy)] = true;
        emit StrategyDeployed(address(strategy), generalExecutor);
        return address(strategy);
    }

    function setStrategyId(bytes32 id, address strategy) public onlyOwner {
        getStrategy[id] = strategy;
    }

    /**
     * @dev need this for as-yet-unknown tokens that may be air-dropped, etc.
     */
    function registerTokens(address strategy, address[] calldata tokens)
        external
        onlyOwner
    {
        require(isStrategyDeployed[strategy], "INVALID_STRATEGY");
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            _registerToken(strategy, token);
        }
    }

    function _registerToken(address strategy, address token) internal {
        require(isStrategyDeployed[strategy], "INVALID_STRATEGY");
        // `add` is safe to call multiple times, as it
        // returns a boolean to indicate if element was added
        _tokenToStrategies[token].add(strategy);
        _strategyToTokens[strategy].add(token);
        _tokenAddresses.add(token);
    }

    function deregisterTokens(address strategy, address[] calldata tokens)
        external
        onlyOwner
    {
        require(isStrategyDeployed[strategy], "INVALID_STRATEGY");
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            _deregisterToken(strategy, token);
        }
    }

    function _deregisterToken(address strategy, address token) internal {
        require(isStrategyDeployed[strategy], "INVALID_STRATEGY");
        // `remove` is safe to call multiple times, as it
        // returns a boolean to indicate if element was removed
        _tokenToStrategies[token].remove(strategy);
        _strategyToTokens[strategy].remove(token);
        if (_tokenToStrategies[token].length() == 0) {
            _tokenAddresses.remove(token);
        }
    }

    function isTokenRegistered(address token) public view returns (bool) {
        return _tokenAddresses.contains(token);
    }

    function fundStrategy(
        address strategy,
        StrategyAllocation memory allocation
    ) public override onlyOwner {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(isStrategyDeployed[strategy], "Invalid Strategy");

        uint256[] memory mintAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            uint256 poolAmount = allocation.amounts[i];
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenEthPrice = pool.getTokenEthPrice();
            uint8 decimals = underlyer.decimals();
            uint256 mintAmount =
                mApt.calculateMintAmount(poolAmount, tokenEthPrice, decimals);
            mintAmounts[i] = mintAmount;

            underlyer.safeTransferFrom(address(pool), strategy, poolAmount);
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.mint(address(pool), mintAmounts[i]);
        }
    }

    function fundAndExecute(
        address strategy,
        StrategyAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps
    ) external override onlyOwner {
        fundStrategy(strategy, allocation);
        execute(strategy, steps);
    }

    function execute(address strategy, APYGenericExecutor.Data[] memory steps)
        public
        override
        onlyOwner
    {
        require(isStrategyDeployed[strategy], "Invalid Strategy");
        IStrategy(strategy).execute(steps);
    }

    function executeAndWithdraw(
        address strategy,
        StrategyAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps
    ) external override onlyOwner {
        execute(strategy, steps);
        withdrawFromStrategy(strategy, allocation);
    }

    function withdrawFromStrategy(
        address strategy,
        StrategyAllocation memory allocation
    ) public override onlyOwner {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(isStrategyDeployed[strategy], "Invalid Strategy");

        uint256[] memory burnAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();
            uint256 amountToSend = allocation.amounts[i];

            uint256 tokenEthPrice = pool.getTokenEthPrice();
            uint8 decimals = underlyer.decimals();
            uint256 burnAmount =
                mApt.calculateMintAmount(amountToSend, tokenEthPrice, decimals);
            burnAmounts[i] = burnAmount;

            underlyer.safeTransferFrom(strategy, address(pool), amountToSend);
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.burn(address(pool), burnAmounts[i]);
        }
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        mApt = APYMetaPoolToken(_mApt);
    }

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(_addressRegistry != address(0), "Invalid address");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    function setPoolIds(bytes32[] memory poolIds) public onlyOwner {
        _poolIds = poolIds;
    }

    function getPoolIds() public view returns (bytes32[] memory) {
        return _poolIds;
    }

    /** @notice Returns the list of asset addresses.
     *  @dev Address list will be populated automatically from the set
     *       of input and output assets for each strategy.
     */
    function getTokenAddresses() external view returns (address[] memory) {
        uint256 length = _tokenAddresses.length();
        address[] memory tokenAddresses = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            tokenAddresses[i] = _tokenAddresses.at(i);
        }
        return tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deleteTokenAddresses() external onlyOwner {
        delete _tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deletePoolIds() external onlyOwner {
        delete _poolIds;
    }

    /** @notice Returns the total balance in the system for given token.
     *  @dev The balance is possibly aggregated from multiple contracts
     *       holding the token.
     */
    function balanceOf(address token) external view returns (uint256) {
        IDetailedERC20 erc20 = IDetailedERC20(token);
        EnumerableSet.AddressSet storage strategies = _tokenToStrategies[token];
        uint256 balance = 0;
        for (uint256 i = 0; i < strategies.length(); i++) {
            address strategy = strategies.at(i);
            uint256 strategyBalance = erc20.balanceOf(strategy);
            balance = balance.add(strategyBalance);
        }
        return balance;
    }

    /// @notice Returns the symbol of the given token.
    function symbolOf(address token) external view returns (string memory) {
        return IDetailedERC20(token).symbol();
    }

    /**
     * @notice Redeems mAPT amount for the pool into its underlyer token.
     * @param poolAddress The address for the selected pool.
     */
    function pushFunds(address payable poolAddress) external onlyOwner {
        uint256 mAptAmount = mApt.balanceOf(poolAddress);

        APYPoolTokenV2 pool = APYPoolTokenV2(poolAddress);
        uint256 tokenEthPrice = pool.getTokenEthPrice();
        IDetailedERC20 underlyer = pool.underlyer();
        uint8 decimals = underlyer.decimals();
        uint256 poolAmount =
            mApt.calculatePoolAmount(mAptAmount, tokenEthPrice, decimals);

        // Burn must happen after pool amount calc, as quantities
        // being compared are post-deposit amounts.
        mApt.burn(poolAddress, mAptAmount);
        underlyer.safeTransfer(poolAddress, poolAmount);
    }

    /**
     * @notice Mint corresponding amount of mAPT tokens for pulled amount.
     * @dev Pool must approve manager to transfer its underlyer token.
     */
    function pullFunds(address payable poolAddress) external onlyOwner {
        APYPoolTokenV2 pool = APYPoolTokenV2(poolAddress);
        IDetailedERC20 underlyer = pool.underlyer();
        uint256 poolAmount = underlyer.balanceOf(poolAddress);
        uint256 poolValue = pool.getEthValueFromTokenAmount(poolAmount);

        uint256 tokenEthPrice = pool.getTokenEthPrice();
        uint8 decimals = underlyer.decimals();
        uint256 mintAmount =
            mApt.calculateMintAmount(poolValue, tokenEthPrice, decimals);

        mApt.mint(poolAddress, mintAmount);
        underlyer.safeTransferFrom(poolAddress, address(this), poolAmount);
    }
}
