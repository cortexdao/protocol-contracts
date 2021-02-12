// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IStrategyFactory.sol";
import "./APYPoolToken.sol";
import "./APYMetaPoolToken.sol";
import "./Strategy.sol";

contract APYManagerV2 is
    Initializable,
    OwnableUpgradeSafe,
    IAssetAllocation,
    IStrategyFactory
{
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    // V1
    address public proxyAdmin;
    IAddressRegistry public addressRegistry;
    APYMetaPoolToken public mApt;

    bytes32[] internal _poolIds;
    address[] internal _tokenAddresses;

    // V2
    mapping(bytes32 => address) public getStrategy;
    mapping(address => bool) public isStrategyDeployed;

    mapping(address => address[]) public strategyToTokens;
    mapping(address => address[]) public tokenToStrategies;
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

    function registerTokens(address strategy, address[] calldata tokens)
        external
        override
        onlyOwner
    {
        // need this for as-yet-unknown tokens that may be air-dropped, etc.
        // XXX: need to handle duplicates instead of nuking old tokens
        strategyToTokens[strategy] = tokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];

            if (!isTokenRegistered(token)) {
                _tokenAddresses.push(token);
            }

            tokenToStrategies[token].push(strategy); // FIXME: handle case when it's already in list
        }
    }

    function isTokenRegistered(address token) public view returns (bool) {
        return tokenToStrategies[token].length > 0;
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
        IStrategy(strategy).execute(steps);
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
    function getTokenAddresses()
        external
        view
        override
        returns (address[] memory)
    {
        return _tokenAddresses;
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
    function balanceOf(address token) external view override returns (uint256) {
        IDetailedERC20 erc20 = IDetailedERC20(token);
        address[] storage strategies = tokenToStrategies[token];
        uint256 balance = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            address strategy = strategies[i];
            uint256 strategyBalance = erc20.balanceOf(strategy);
            balance = balance.add(strategyBalance);
        }
        return balance;
    }

    /// @notice Returns the symbol of the given token.
    function symbolOf(address token)
        external
        view
        override
        returns (string memory)
    {
        return IDetailedERC20(token).symbol();
    }

    /**
     * @notice Redeems mAPT amount for the pool into its underlyer token.
     * @param poolAddress The address for the selected pool.
     */
    function pushFunds(address payable poolAddress) external onlyOwner {
        uint256 mAptAmount = mApt.balanceOf(poolAddress);

        APYPoolToken pool = APYPoolToken(poolAddress);
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
        APYPoolToken pool = APYPoolToken(poolAddress);
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

    /**
     * @notice Mint corresponding amount of mAPT tokens for pulled amount.
     * @dev Pool must approve manager to transfer its underlyer token.
     */
    function fundStrategy(
        address strategyAddress,
        StrategyAllocation memory allocation
    ) public onlyOwner {
        require(
            allocation.pools.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        for (uint256 i = 0; i < allocation.pools.length; i++) {
            APYPoolToken pool = APYPoolToken(allocation.pools[i]);
            IDetailedERC20 underlyer = pool.underlyer();
            uint256 poolAmount = allocation.amounts[i];
            uint256 poolValue = pool.getEthValueFromTokenAmount(poolAmount);

            uint256 tokenEthPrice = pool.getTokenEthPrice();
            uint8 decimals = underlyer.decimals();
            // uint256 mintAmount =
            //     mApt.calculateMintAmount(poolValue, tokenEthPrice, decimals);

            // mApt.mint(poolAddress, mintAmount);
            underlyer.safeTransferFrom(
                address(pool),
                strategyAddress,
                poolAmount
            );
        }
    }
}
