// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
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
    uint256 public constant DEFAULT_MAPT_TO_UNDERLYER_FACTOR = 1000;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    address public manager;
    AggregatorV3Interface public tvlAgg;
    AggregatorV3Interface public ethUsdAgg;
    uint256 public aggStalePeriod;
    uint256 public lastMintOrBurn;

    /* ------------------------------- */

    event Mint(address acccount, uint256 amount);
    event Burn(address acccount, uint256 amount);
    event AdminChanged(address);
    event ManagerChanged(address);
    event TvlAggregatorChanged(address agg);
    event EthUsdAggregatorChanged(address agg);

    function initialize(
        address adminAddress,
        address _tvlAgg,
        address _ethUsdAgg,
        uint256 _aggStalePeriod
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(_tvlAgg != address(0), "INVALID_AGG");
        require(_ethUsdAgg != address(0), "INVALID_AGG");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY MetaPool Token", "mAPT");

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        setTvlAggregator(_tvlAgg);
        setEthUsdAggregator(_ethUsdAgg);
        setAggStalePeriod(_aggStalePeriod);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function setTvlAggregator(address _tvlAgg) public onlyOwner {
        require(_tvlAgg != address(0), "INVALID_AGG");
        tvlAgg = AggregatorV3Interface(_tvlAgg);
        emit TvlAggregatorChanged(_tvlAgg);
    }

    function setEthUsdAggregator(address _ethUsdAgg) public onlyOwner {
        require(_ethUsdAgg != address(0), "INVALID_AGG");
        ethUsdAgg = AggregatorV3Interface(_ethUsdAgg);
        emit EthUsdAggregatorChanged(_ethUsdAgg);
    }

    function setAggStalePeriod(uint256 _aggStalePeriod) public onlyOwner {
        require(_aggStalePeriod > 0, "INVALID_STALE_PERIOD");
        aggStalePeriod = _aggStalePeriod;
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    function mint(address account, uint256 amount) public override onlyManager {
        lastMintOrBurn = block.timestamp; // solhint-disable-line not-rely-on-time
        _mint(account, amount);
        emit Mint(account, amount);
    }

    function burn(address account, uint256 amount) public override onlyManager {
        lastMintOrBurn = block.timestamp; // solhint-disable-line not-rely-on-time
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

    /**
     * @notice Get the ETH value of all assets being managed by the APYManager,
     *         i.e. the "deployed capital".  This is the same as the total value
     *         represented by the total mAPT supply.
     * @return uint256 the ETH value of the deployed capital
     * @dev Chainlink's aggregator will return USD value but for compatibility
     *      with the stablecoin pools, we return the value in ETH value.
     */
    function getTVL() public view virtual returns (uint256) {
        uint256 usdTvl = getUsdTvl();
        uint256 ethUsdPrice = getEthUsdPrice();
        return uint256(usdTvl).mul(10**18).div(ethUsdPrice);
    }

    /**
     * @notice Get the latest TVL in USD from the Chainlink adapter.
     * @dev USD prices have 8 decimals.
     * @return uint256 deployed TVL value in USD
     */
    function getUsdTvl() public view returns (uint256) {
        // possible revert with "No data present" but this can
        // only happen if there has never been a successful round.
        (, int256 answer, , uint256 updatedAt, ) = tvlAgg.latestRoundData();
        require(answer >= 0, "CHAINLINK_INVALID_ANSWER");
        validateNotStale(updatedAt);
        return uint256(answer);
    }

    /**
     * @notice Get the price for 1 ETH in USD from the Chainlink adapter.
     * @dev USD prices have 8 decimals.
     * @return uint256 ETH price in USD
     */
    function getEthUsdPrice() public view returns (uint256) {
        // possible revert with "No data present" but this can
        // only happen if there has never been a successful round.
        (, int256 answer, , uint256 updatedAt, ) = ethUsdAgg.latestRoundData();
        require(answer > 0, "CHAINLINK_INVALID_ANSWER");
        validateNotStale(updatedAt);
        return uint256(answer);
    }

    /**
     * @notice Checks to guard against stale data from Chainlink:
     *
     *         1. Require time since last update is not greater than `aggStalePeriod`.
     *
     *         2. Require update took place after last change in mAPT supply
     *            (mint or burn), as it is necessary pulled deployed value always
     *            reflects the newly acquired/disposed of funds from pools.
     *
     * @param updatedAt update time for Chainlink round
     */
    function validateNotStale(uint256 updatedAt) private view {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp.sub(updatedAt) < aggStalePeriod,
            "CHAINLINK_STALE_DATA"
        );
        require(updatedAt > lastMintOrBurn, "CHAINLINK_STALE_DATA");
        // solhint-enable not-rely-on-time
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
        uint256 depositValue =
            (depositAmount.mul(tokenEthPrice)).div(10**decimals);
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
        if (mAptAmount == 0) return 0;
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        uint256 poolEthValue = (mAptAmount.mul(getTVL())).div(totalSupply());
        uint256 poolAmount =
            (poolEthValue.mul(10**decimals)).div(tokenEthPrice);
        return poolAmount;
    }

    /**
     * @notice Get the ETH-denominated value (in wei) of the pool's share
     *         of the deployed capital, as tracked by the mAPT token.
     * @return uint256
     */
    function getDeployedEthValue(address pool) public view returns (uint256) {
        uint256 balance = balanceOf(pool);
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0 || balance == 0) return 0;

        return getTVL().mul(balance).div(totalSupply);
    }
}
