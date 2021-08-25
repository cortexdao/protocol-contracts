const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  MAX_UINT256,
  bytes32,
  forciblySendEth,
  impersonateAccount,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Zaps", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let lpSafe;
  let mApt;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
  let tvlManager;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, lpSafe, mApt] = await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("IOracleAdapter").abi
    );
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for Erc20Allocation:
     * - emergencySafe (default admin role)
     * - lpSafe (LP role)
     * - mApt (contract role)
     */
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.mAptAddress.returns(mApt.address);

    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
    );
    await tvlManager.connect(lpSafe).registerAssetAllocation(erc20Allocation.address)
  });

  describe("Curve 3Pool", () => {
    let zap;

    let lpToken;
    let stableSwap;
    let gauge;

    let underlyerToken;
    const underlyerIndex = 0;
    let lookupId;

    let numberOfCoins = 3;
    // Curve sUSDv2 pool, holds DAI
    let whaleAddress = STABLECOIN_POOLS["DAI"];

    before("Deploy zap contract", async () => {
      const Curve3PoolZap = await ethers.getContractFactory(
        "Curve3PoolZap",
        lpSafe
      );
      zap = await Curve3PoolZap.deploy();
    });

    before("Attach to Mainnet Curve contracts", async () => {
      const STABLE_SWAP_ADDRESS = await zap.STABLE_SWAP_ADDRESS();
      stableSwap = await ethers.getContractAt(
        "IStableSwap",
        STABLE_SWAP_ADDRESS,
        lpSafe
      );

      const LP_TOKEN_ADDRESS = await zap.LP_TOKEN_ADDRESS();
      lpToken = await ethers.getContractAt(
        "IDetailedERC20",
        LP_TOKEN_ADDRESS,
        lpSafe
      );

      const LIQUIDITY_GAUGE_ADDRESS = await zap.LIQUIDITY_GAUGE_ADDRESS();
      gauge = await ethers.getContractAt(
        "ILiquidityGauge",
        LIQUIDITY_GAUGE_ADDRESS,
        lpSafe
      );
    });

    before("Fund zap with pool underlyer", async () => {
      const underlyerAddress = await stableSwap.coins(underlyerIndex);
      underlyerToken = await ethers.getContractAt(
        "IDetailedERC20",
        underlyerAddress
      );

      const amount = tokenAmountToBigNumber(
        100000,
        await underlyerToken.decimals()
      );
      const sender = whaleAddress;
      await acquireToken(sender, zap.address, underlyerToken, amount, deployer);
    });

    it("Deposit into pool and stake in gauge", async () => {
      const amounts = new Array(numberOfCoins).fill("0");
      const underlyerAmount = tokenAmountToBigNumber(
        1000,
        await underlyerToken.decimals()
      );
      amounts[underlyerIndex] = underlyerAmount;

      await zap.deployLiquidity(amounts);

      const zapLpBalance = await lpToken.balanceOf(zap.address);
      console.log("zap LP token balance:", zapLpBalance.toString());
      const gaugeLpBalance = await gauge.balanceOf(zap.address);
      console.log("gauge LP token balance:", gaugeLpBalance.toString());

      await zap.unwindLiquidity(gaugeLpBalance);
      // TODO: check all balances
      const zapUnderlyerBalance = await underlyerToken.balanceOf(zap.address);
      console.log("zap underlyer balance:", zapUnderlyerBalance.toString());
    });
  });
});
