// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IMintable.sol";

contract APYMetaPoolToken is
    Initializable,
    OwnableUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    ERC20UpgradeSafe,
    IMintable
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    uint256 public constant DEFAULT_MAPT_TO_UNDERLYER_FACTOR = 1000;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    AggregatorV3Interface public tvlAgg;
    address public manager;

    /* ------------------------------- */

    event Mint(address acccount, uint256 amount);
    event Burn(address acccount, uint256 amount);
    event AdminChanged(address);
    event ManagerChanged(address);
    event TvlAggregatorChanged(address agg);

    function initialize(address adminAddress, AggregatorV3Interface _tvlAgg)
        external
        initializer
    {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(address(_tvlAgg) != address(0), "INVALID_AGG");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY MetaPool Token", "mAPT");

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        setTvlAggregator(_tvlAgg);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function setTvlAggregator(AggregatorV3Interface _priceAgg)
        public
        onlyOwner
    {
        require(address(_priceAgg) != address(0), "INVALID_AGG");
        tvlAgg = _priceAgg;
        emit TvlAggregatorChanged(address(_priceAgg));
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    function mint(address account, uint256 amount) public override onlyManager {
        _mint(account, amount);
        emit Mint(account, amount);
    }

    function burn(address account, uint256 amount) public override onlyManager {
        _burn(account, amount);
        emit Burn(account, amount);
    }

    function setManagerAddress(address managerAddress) public onlyOwner {
        require(managerAddress != address(0), "INVALID_ADMIN");
        manager = managerAddress;
        emit ManagerChanged(managerAddress);
    }

    modifier onlyManager() {
        require(msg.sender == manager, "MANAGER_ONLY");
        _;
    }

    function getTVL() public view returns (uint256) {
        (, int256 price, , , ) = tvlAgg.latestRoundData();
        require(price > 0, "UNABLE_TO_RETRIEVE_TVL");
        return uint256(price);
    }

    /** @notice Calculate mAPT amount to be minted for given pool's underlyer amount.
     *  @param depositAmount Pool underlyer amount to be converted
     *  @param tokenEthPrice Pool underlyer's ETH price (in wei) per underlyer token
     *  @param decimals Pool underlyer's number of decimals
     *  @dev Price parameter is in units of wei per token ("big" unit), since
     *       attempting to express wei per token bit ("small" unit) will be
     *       fractional, requiring fixed-point representation.  This means we need
     *       to also pass in the underlyer's number of decimals to do the appropriate
     *       multiplication in the calculation.
     */
    function calculateMintAmount(
        uint256 depositAmount,
        uint256 tokenEthPrice,
        uint256 decimals
    ) public view returns (uint256) {
        uint256 depositValue = depositAmount.mul(tokenEthPrice).div(
            10**decimals
        );
        uint256 totalValue = getTVL();
        return _calculateMintAmount(depositValue, totalValue);
    }

    /**
     *  @notice amount of mAPT minted should be in same ratio to mAPT supply
     *          as token amount sent is to contract's token balance, i.e.:
     *
     *          mint amount / total supply (before deposit)
     *          = token amount sent / contract token balance (before deposit)
     */
    function _calculateMintAmount(uint256 depositValue, uint256 totalValue)
        internal
        view
        returns (uint256)
    {
        uint256 totalSupply = totalSupply();

        if (totalValue == 0 || totalSupply == 0) {
            return depositValue.mul(DEFAULT_MAPT_TO_UNDERLYER_FACTOR);
        }

        return (depositValue.mul(totalSupply)).div(totalValue);
    }

    /** @notice Calculate amount in pool's underlyer token from given mAPT amount.
     *  @param mAptAmount mAPT amount to be converted
     *  @param tokenEthPrice Pool underlyer's ETH price (in wei) per underlyer token
     *  @param decimals Pool underlyer's number of decimals
     *  @dev Price parameter is in units of wei per token ("big" unit), since
     *       attempting to express wei per token bit ("small" unit) will be
     *       fractional, requiring fixed-point representation.  This means we need
     *       to also pass in the underlyer's number of decimals to do the appropriate
     *       multiplication in the calculation.
     */
    function calculatePoolAmount(
        uint256 mAptAmount,
        uint256 tokenEthPrice,
        uint256 decimals
    ) public view returns (uint256) {
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        uint256 poolEthValue = mAptAmount.mul(getTVL()).div(totalSupply());
        uint256 poolAmount = poolEthValue.mul(10**decimals).div(tokenEthPrice);
        return poolAmount;
    }
}
