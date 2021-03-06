const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  acquireToken,
  getStablecoinAddress,
  MAX_UINT256,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const IStableSwap = artifacts.require("IStableSwap");
const ILiquidityGauge = artifacts.require("ILiquidityGauge");

// 3Pool addresses:
const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

describe("Contract: CurvePeriphery", () => {
  // signers
  let deployer;
  let strategy;

  // contract factories
  let CurvePeriphery;

  // deployed contracts
  let curve;

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
    [deployer, strategy] = await ethers.getSigners();
    CurvePeriphery = await ethers.getContractFactory("CurvePeriphery");
    curve = await CurvePeriphery.deploy();
    await curve.deployed();
  });

  describe("getUnderlyerBalance", () => {
    let stableSwap;
    let lpToken;
    let liquidityGauge;

    const coinIndex = 0;
    const stablecoins = {};

    before(async () => {
      lpToken = await ethers.getContractAt(
        IDetailedERC20.abi,
        LP_TOKEN_ADDRESS
      );
      stableSwap = await ethers.getContractAt(
        IStableSwap.abi,
        STABLE_SWAP_ADDRESS
      );
      liquidityGauge = await ethers.getContractAt(
        ILiquidityGauge.abi,
        LIQUIDITY_GAUGE_ADDRESS
      );

      for (const symbol of ["DAI", "USDC", "USDT"]) {
        const stablecoinAddress = getStablecoinAddress(symbol, "MAINNET");
        stablecoins[symbol] = await ethers.getContractAt(
          "IDetailedERC20",
          stablecoinAddress
        );
      }

      for (const symbol of Object.keys(stablecoins)) {
        const token = stablecoins[symbol];
        const decimals = await token.decimals();
        const amount = tokenAmountToBigNumber("10000", decimals);
        const sender = STABLECOIN_POOLS[symbol];
        await acquireToken(sender, strategy, token, amount, deployer);
      }
    });

    it.only("Get underlyer balance from strategy holding", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const minAmount = 0;
      await stablecoins["DAI"]
        .connect(strategy)
        .approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(strategy)
        .add_liquidity([daiAmount, "0", "0"], minAmount);
      const expectedBalance = strategyLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        strategy.address,
        stableSwap.address,
        liquidityGauge.address,
        lpToken.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        strategy.address,
        stableSwap.address,
        liquidityGauge.address,
        lpToken.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      const lpBalance = strategyLpBalance.add(gaugeLpBalance);
      const expectedBalance = lpBalance.mul(poolBalance).div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        strategy.address,
        stableSwap.address,
        liquidityGauge.address,
        lpToken.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });
  });
});
