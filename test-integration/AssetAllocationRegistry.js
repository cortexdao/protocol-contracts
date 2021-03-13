#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
const hre = require("hardhat");
const { ethers } = hre;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  bytes32,
  getStablecoinAddress,
  acquireToken,
  MAX_UINT256,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

const dai = (amount) => tokenAmountToBigNumber(amount, "18");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

// Curve 3Pool Mainnet addresses:
const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

describe("Contract: APYAssetAllocationRegistry", () => {
  /* signers */
  let deployer;
  let manager;
  let strategy;

  /* contract factories */
  let APYAssetAllocationRegistry;

  /* deployed contracts */
  let registry;

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
    [deployer, manager, strategy] = await ethers.getSigners();

    APYAssetAllocationRegistry = await ethers.getContractFactory(
      "APYAssetAllocationRegistry"
    );
    registry = await APYAssetAllocationRegistry.deploy(manager.address);
    await registry.deployed();
  });

  describe("Curve periphery", () => {
    let CurvePeriphery;
    let curve;

    // Curve 3Pool
    let lpToken;
    let stableSwap;
    let gauge;

    let daiToken;

    const daiSymbol = "DAI";
    const daiDecimals = 18;
    const daiIndex = 0;

    const allocationId = bytes32("1");

    before("Deploy and attach to contracts", async () => {
      CurvePeriphery = await ethers.getContractFactory("CurvePeriphery");
      curve = await CurvePeriphery.deploy();
      await curve.deployed();

      lpToken = await ethers.getContractAt("IDetailedERC20", LP_TOKEN_ADDRESS);
      stableSwap = await ethers.getContractAt(
        "IStableSwap",
        STABLE_SWAP_ADDRESS
      );
      gauge = await ethers.getContractAt(
        "ILiquidityGauge",
        LIQUIDITY_GAUGE_ADDRESS
      );
    });

    before("Prepare account 0 with DAI funds", async () => {
      const daiAddress = getStablecoinAddress("DAI", "MAINNET");
      daiToken = await ethers.getContractAt("IDetailedERC20", daiAddress);

      const amount = dai(500000);
      const sender = STABLECOIN_POOLS["DAI"];
      await acquireToken(sender, strategy, daiToken, amount, deployer);
    });

    before("Register asset allocation", async () => {
      const calldata = CurvePeriphery.interface.encodeFunctionData(
        "getUnderlyerBalance(address,address,address,address,uint256)",
        [
          strategy.address,
          stableSwap.address,
          gauge.address,
          lpToken.address,
          daiIndex,
        ]
      );
      const data = [curve.address, calldata];
      await registry.addAssetAllocation(
        allocationId,
        data,
        daiSymbol,
        daiDecimals
      );
    });

    it("Get underlyer balance from account holding", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(strategy).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(strategy)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      const strategyLpBalance = await lpToken.balanceOf(strategy.address);
      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = strategyLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await registry.balanceOf(allocationId)).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(strategy).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(strategy)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      await lpToken.connect(strategy).approve(gauge.address, MAX_UINT256);
      const strategyLpBalance = await lpToken.balanceOf(strategy.address);
      await gauge.connect(strategy)["deposit(uint256)"](strategyLpBalance);
      expect(await lpToken.balanceOf(strategy.address)).to.equal(0);
      const gaugeLpBalance = await gauge.balanceOf(strategy.address);
      expect(gaugeLpBalance).to.be.gt(0);

      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await registry.balanceOf(allocationId)).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(strategy).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(strategy)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      // split LP tokens between strategy and gauge
      const totalLPBalance = await lpToken.balanceOf(strategy.address);
      const strategyLpBalance = totalLPBalance.div(3);
      const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
      expect(gaugeLpBalance).to.be.gt(0);
      expect(strategyLpBalance).to.be.gt(0);

      await lpToken.connect(strategy).approve(gauge.address, MAX_UINT256);
      await gauge.connect(strategy)["deposit(uint256)"](gaugeLpBalance);

      expect(await lpToken.balanceOf(strategy.address)).to.equal(
        strategyLpBalance
      );
      expect(await gauge.balanceOf(strategy.address)).to.equal(gaugeLpBalance);

      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = totalLPBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await registry.balanceOf(allocationId)).to.equal(expectedBalance);
    });
  });
});
