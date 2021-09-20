const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");

describe("Contract: TestCurveZap", () => {
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
    [deployer, swap] = await ethers.getSigners();

    const erc20Abi = artifacts.readArtifactSync("IDetailedERC20").abi;

    lpToken = await deployMockContract(deployer, erc20Abi);
    await lpToken.mock.allowance.returns(0);
    await lpToken.mock.approve.returns(true);
    await lpToken.mock.balanceOf.returns(1);

    liquidityGauge = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ILiquidityGauge").abi
    );
    await liquidityGauge.mock.deposit.returns();
    await liquidityGauge.mock.withdraw.returns();

    curvePoolFactory = await ethers.getContractFactory("TestCurveZap");
    curvePool = await curvePoolFactory.deploy(
      swap.address,
      lpToken.address,
      liquidityGauge.address,
      denominator,
      slippage,
      numberOfCoins
    );

    const underlyers = await Promise.all(
      Array(3)
        .fill(null)
        .map(async () => {
          const underlyer = await deployMockContract(deployer, erc20Abi);
          await underlyer.mock.allowance.returns(0);
          await underlyer.mock.approve.returns(true);
          return underlyer.address;
        })
    );
    curvePool.setUnderlyers(underlyers);
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

      expect(name).to.equals("TestCurveZap");
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

  describe("deployLiquidity", () => {
    it("does not revert with the correct number of amounts", async () => {
      const amounts = [1, 2, 3];
      await expect(curvePool.deployLiquidity(amounts)).to.not.be.reverted;
    });

    it("reverts with an incorrect number of amounts", async () => {
      const amounts = [1, 2];
      await expect(curvePool.deployLiquidity(amounts)).to.be.revertedWith(
        "INVALID_AMOUNTS"
      );
    });
  });

  describe("unwindLiquidity", () => {
    it("does not revert with a correct token index", async () => {
      const amount = 1;
      const index = 0;
      await expect(curvePool.unwindLiquidity(amount, index)).to.not.be.reverted;
    });

    it("reverts with an incorrect token index", async () => {
      const amount = 1;
      const index = 4;
      await expect(curvePool.unwindLiquidity(amount, index)).to.be.revertedWith(
        "INVALID_INDEX"
      );
    });
  });
});
