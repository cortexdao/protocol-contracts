// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/EnumerableSet.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/ITokenRegistry.sol";
import "./interfaces/IStrategyFactory.sol";

contract ChainlinkRegistry is
    Initializable,
    OwnableUpgradeSafe,
    ITokenRegistry,
    IAssetAllocation
{
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    address public proxyAdmin;
    IStrategyFactory public manager;

    EnumerableSet.AddressSet internal _tokenAddresses;
    mapping(address => EnumerableSet.AddressSet) internal _strategyToTokens;
    mapping(address => EnumerableSet.AddressSet) internal _tokenToStrategies;

    event AdminChanged(address);
    event ManagerChanged(address);

    function initialize(address adminAddress, address managerAddress)
        external
        initializer
    {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(managerAddress != address(0), "INVALID_MANAGER");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        setManagerAddress(managerAddress);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function setManagerAddress(address managerAddress) public onlyOwner {
        require(managerAddress != address(0), "INVALID_MANAGER");
        manager = IStrategyFactory(managerAddress);
        emit ManagerChanged(managerAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /**
     * @dev need this for as-yet-unknown tokens that may be air-dropped, etc.
     */
    function registerTokens(address strategy, address[] calldata tokens)
        external
        override
        onlyOwner
    {
        require(manager.isStrategyDeployed(strategy), "INVALID_STRATEGY");
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            _registerToken(strategy, token);
        }
    }

    function _registerToken(address strategy, address token) internal {
        require(manager.isStrategyDeployed(strategy), "INVALID_STRATEGY");
        // `add` is safe to call multiple times, as it
        // returns a boolean to indicate if element was added
        _tokenToStrategies[token].add(strategy);
        _strategyToTokens[strategy].add(token);
        _tokenAddresses.add(token);
    }

    function deregisterTokens(address strategy, address[] calldata tokens)
        external
        override
        onlyOwner
    {
        require(manager.isStrategyDeployed(strategy), "INVALID_STRATEGY");
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            _deregisterToken(strategy, token);
        }
    }

    function _deregisterToken(address strategy, address token) internal {
        require(manager.isStrategyDeployed(strategy), "INVALID_STRATEGY");
        // `remove` is safe to call multiple times, as it
        // returns a boolean to indicate if element was removed
        _tokenToStrategies[token].remove(strategy);
        _strategyToTokens[strategy].remove(token);
        if (_tokenToStrategies[token].length() == 0) {
            _tokenAddresses.remove(token);
        }
    }

    function isTokenRegistered(address token)
        public
        view
        override
        returns (bool)
    {
        return _tokenAddresses.contains(token);
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
        uint256 length = _tokenAddresses.length();
        address[] memory tokenAddresses = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            tokenAddresses[i] = _tokenAddresses.at(i);
        }
        return tokenAddresses;
    }

    /** @notice Returns the total balance in the system for given token.
     *  @dev The balance is possibly aggregated from multiple contracts
     *       holding the token.
     */
    function balanceOf(address token) external view override returns (uint256) {
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
    function symbolOf(address token)
        external
        view
        override
        returns (string memory)
    {
        return IDetailedERC20(token).symbol();
    }
}
