// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./interfaces/IAssetAllocation.sol";

contract APYManager is Initializable, OwnableUpgradeSafe, IAssetAllocation {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    address public mApt; // placeholder for future-proofing storage

    mapping(string => address) public pools;
    string[] public poolNames;
    address[] internal _tokenAddresses;

    /* ------------------------------- */

    event AdminChanged(address);

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

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    /** @notice Returns the list of asset addresses.
     *  @dev Address list will be populated automatically from the set
     *       of input and output assets for each strategy.
     */
    function getTokenAddresses()
        external
        override
        view
        returns (address[] memory)
    {
        return _tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration
    function setTokenAddresses(address[] calldata tokenAddresses)
        external
        onlyOwner
    {
        _tokenAddresses = tokenAddresses;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deleteTokenAddresses() external onlyOwner {
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            _tokenAddresses[i] = address(0);
        }
    }

    /** @notice Returns the total balance in the system for given token.
     *  @dev The balance is possibly aggregated from multiple contracts
     *       holding the token.
     *
     *       This is a temporary implementation until there are deployed funds.
     *       In actuality, we will not be computing the TVL from the pools,
     *       as their funds will not be tokenized into mAPT.
     */
    function balanceOf(address token) external override view returns (uint256) {
        IERC20 erc20 = IERC20(token);
        uint256 balance = 0;
        for (uint256 i = 0; i < poolNames.length; i++) {
            uint256 poolBalance = erc20.balanceOf(pools[poolNames[i]]);
            balance = balance.add(poolBalance);
        }
        return balance;
    }

    /// @notice Returns the symbol of the given token.
    function symbolOf(address token)
        external
        override
        view
        returns (string memory)
    {
        return ERC20UpgradeSafe(token).symbol();
    }
}
