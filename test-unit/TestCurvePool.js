const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");

describe("Contract: TestCurvePool", () => {
  // signers
  let deployer;

  // contract factories
  let curvePoolFactory;

  // deployed contracts
  let curvePool;
  let swap;
  let lpToken;
  let liquidityGauge;
  const denominator = 10000;
  const slippage = 100;
  const numberOfCoins = 3;

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
    [deployer, swap, lpToken, liquidityGauge] = await ethers.getSigners();

    curvePoolFactory = await ethers.getContractFactory("TestCurvePool");
    curvePool = await curvePoolFactory.deploy(
      swap.address,
      lpToken.address,
      liquidityGauge.address,
      denominator,
      slippage,
      numberOfCoins
    );
  });

  describe("Constructor", () => {
    it("Test Inherited Contract Variables are set corretly", async () => {
      const name = await curvePool.connect(deployer).NAME();
      const swapAddress = await curvePool.connect(deployer).getSwapAddress();
      const lpAddress = await curvePool.connect(deployer).getLpTokenAddress();
      const gaugeAddress = await curvePool.connect(deployer).getGaugeAddress();
      const denom = await curvePool.connect(deployer).getDenominator();
      const slip = await curvePool.connect(deployer).getSlippage();
      const coinCount = await curvePool.connect(deployer).getNumberOfCoins();

      expect(name).to.equals("TestCurvePool");
      expect(swapAddress).to.equals(swap.address);
      expect(lpAddress).to.equals(lpToken.address);
      expect(gaugeAddress).to.equals(liquidityGauge.address);
      expect(denom.toNumber()).to.equals(denominator);
      expect(slip.toNumber()).to.equals(slippage);
      expect(coinCount.toNumber()).to.equals(numberOfCoins);
    });

    it("Test calcMinAmount returns correct amount", async () => {
      // uint256 v = totalAmount.mul(1e18).div(virtualPrice);
      // return v.mul(10000.sub(100)).div(10000);
      const totalAmount = 987654;
      const virtualPrice = 1234;
      const minAmount = await curvePool.calcMinAmount(
        totalAmount,
        virtualPrice
      );
      expect(minAmount.toString()).to.equals("792364230145867098864");
    });
  });
});
