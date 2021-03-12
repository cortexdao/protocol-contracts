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

/**
 * @title APY Meta Pool Token
 * @author APY.Finance
 * @notice This token is used to keep track of the capital that has been
 * pulled from the APYPoolToken contracts.
 *
 * When the APYManager pulls capital from the APYPoolToken contracts to
 * deploy to yield farming strategies, it will mint mAPT and transfer it to
 * the APYPoolToken contracts. The ratio of the mAPT held by each APYPoolToken
 * to the total supply of mAPT determines the amount of the TVL dedicated to
 * APYPoolToken.
 *
 * DEPLOY CAPITAL TO YIELD FARMING STRATEGIES
 * Tracks the share of deployed TVL owned by an APYPoolToken using mAPT.
 *
 * +--------------+   APYManagerV2.fundAccount   +--------------+
 * | APYPoolToken | ---------------------------> | APYManagerV2 |
 * +--------------+     APYMetaPoolToken.mint    +--------------+
 *                  <---------------------------
 *
 *
 * WITHDRAW CAPITAL FROM YIELD FARMING STRATEGIES
 * Uses mAPT to calculate the amount of capital returned to the APYPoolToken.
 *
 * +--------------+   APYManagerV2.withdrawFromAccount   +--------------+
 * | APYPoolToken | <----------------------------------- | APYManagerV2 |
 * +--------------+        APYMetaPoolToken.burn         +--------------+
 *                  ----------------------------------->
 */
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
    uint256 public aggStalePeriod;
    uint256 public lastMintOrBurn;

    /* ------------------------------- */

    event Mint(address acccount, uint256 amount);
    event Burn(address acccount, uint256 amount);
    event AdminChanged(address);
    event ManagerChanged(address);
    event TvlAggregatorChanged(address agg);

    function initialize(
        address adminAddress,
        address _tvlAgg,
        uint256 _aggStalePeriod
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(_tvlAgg != address(0), "INVALID_AGG");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY MetaPool Token", "mAPT");

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        setTvlAggregator(_tvlAgg);
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
     * @notice Get the USD value of all assets being managed by the APYManager,
     *         i.e. the "deployed capital".  This is the same as the total value
     *         represented by the total mAPT supply.
     *
     * @dev Chainlink nodes read from the AssetAllocationRegistry, pull the
     *      prices from market feeds, and submits the calculated total value
     *      to an aggregator contract.
     *
     *      USD prices have 8 decimals.
     *
     * @return the USD value of the deployed capital
     */
    function getTVL() public view virtual returns (uint256) {
        // possible revert with "No data present" but this can
        // only happen if there has never been a successful round.
        (, int256 answer, , uint256 updatedAt, ) = tvlAgg.latestRoundData();
        require(answer >= 0, "CHAINLINK_INVALID_ANSWER");
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
     *  @param tokenPrice Pool underlyer's USD price (in wei) per underlyer token
     *  @param decimals Pool underlyer's number of decimals
     *  @dev Price parameter is in units of wei per token ("big" unit), since
     *       attempting to express wei per token bit ("small" unit) will be
     *       fractional, requiring fixed-point representation.  This means we need
     *       to also pass in the underlyer's number of decimals to do the appropriate
     *       multiplication in the calculation.
     */
    function calculateMintAmount(
        uint256 depositAmount,
        uint256 tokenPrice,
        uint256 decimals
    ) public view returns (uint256) {
        uint256 depositValue = depositAmount.mul(tokenPrice).div(10**decimals);
        uint256 totalValue = getTVL();
        return _calculateMintAmount(depositValue, totalValue);
    }

    /**
     *  @dev amount of APT minted should be in same ratio to APT supply
     *       as deposit value is to pool's total value, i.e.:
     *
     *       mint amount / total supply
     *       = deposit value / pool total value
     *
     *       For denominators, pre or post-deposit amounts can be used.
     *       The important thing is they are consistent, i.e. both pre-deposit
     *       or both post-deposit.
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

        return depositValue.mul(totalSupply).div(totalValue);
    }

    /** @notice Calculate amount in pool's underlyer token from given mAPT amount.
     *  @param mAptAmount mAPT amount to be converted
     *  @param tokenPrice Pool underlyer's USD price (in wei) per underlyer token
     *  @param decimals Pool underlyer's number of decimals
     *  @dev Price parameter is in units of wei per token ("big" unit), since
     *       attempting to express wei per token bit ("small" unit) will be
     *       fractional, requiring fixed-point representation.  This means we need
     *       to also pass in the underlyer's number of decimals to do the appropriate
     *       multiplication in the calculation.
     */
    function calculatePoolAmount(
        uint256 mAptAmount,
        uint256 tokenPrice,
        uint256 decimals
    ) public view returns (uint256) {
        if (mAptAmount == 0) return 0;
        require(totalSupply() > 0, "INSUFFICIENT_TOTAL_SUPPLY");
        uint256 poolValue = mAptAmount.mul(getTVL()).div(totalSupply());
        uint256 poolAmount = poolValue.mul(10**decimals).div(tokenPrice);
        return poolAmount;
    }

    /**
     * @notice Get the USD-denominated value (in wei) of the pool's share
     *         of the deployed capital, as tracked by the mAPT token.
     * @return uint256
     */
    function getDeployedValue(address pool) public view returns (uint256) {
        uint256 balance = balanceOf(pool);
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0 || balance == 0) return 0;

        return getTVL().mul(balance).div(totalSupply);
    }
}
