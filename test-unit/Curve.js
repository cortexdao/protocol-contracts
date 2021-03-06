const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { tokenAmountToBigNumber } = require("../utils/helpers");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const IStableSwap = artifacts.require("IStableSwap");
const ILiquidityGauge = artifacts.require("ILiquidityGauge");

describe.only("Contract: CurvePeriphery", () => {
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
    let stableSwapMock;
    let lpTokenMock;
    let liquidityGaugeMock;

    const coinIndex = 0;

    before(async () => {
      lpTokenMock = await deployMockContract(deployer, IDetailedERC20.abi);

      stableSwapMock = await deployMockContract(deployer, IStableSwap.abi);
      // await stableSwapMock.mock.lp_token.returns(lpTokenMock.address);

      liquidityGaugeMock = await deployMockContract(
        deployer,
        ILiquidityGauge.abi
      );

      await stableSwapMock.mock.N_COINS.returns(4);
    });

    it("Get underlyer balance from strategy holding", async () => {
      // setup stableswap with underlyer balance
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      // setup LP token with supply and strategy balance
      const lpTotalSupply = tokenAmountToBigNumber(1234);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
      const strategyLpBalance = tokenAmountToBigNumber(518);
      await lpTokenMock.mock.balanceOf
        .withArgs(strategy.address)
        .returns(strategyLpBalance);
      // setup gauge with strategy balance
      await liquidityGaugeMock.mock.balanceOf
        .withArgs(strategy.address)
        .returns(0);

      const expectedBalance = strategyLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        strategy.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        lpTokenMock.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      // setup stableswap with underlyer balance
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      // setup LP token with supply and strategy balance
      const lpTotalSupply = tokenAmountToBigNumber(1234);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
      await lpTokenMock.mock.balanceOf.withArgs(strategy.address).returns(0);
      // setup gauge with strategy balance
      const gaugeLpBalance = tokenAmountToBigNumber(256);
      await liquidityGaugeMock.mock.balanceOf
        .withArgs(strategy.address)
        .returns(gaugeLpBalance);

      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        strategy.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        lpTokenMock.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      // setup stableswap with underlyer balance
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      // setup LP token with supply and strategy balance
      const lpTotalSupply = tokenAmountToBigNumber(1234);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
      const strategyLpBalance = tokenAmountToBigNumber(51);
      await lpTokenMock.mock.balanceOf
        .withArgs(strategy.address)
        .returns(strategyLpBalance);
      // setup gauge with strategy balance
      const gaugeLpBalance = tokenAmountToBigNumber(256);
      await liquidityGaugeMock.mock.balanceOf
        .withArgs(strategy.address)
        .returns(gaugeLpBalance);

      const lpBalance = strategyLpBalance.add(gaugeLpBalance);
      const expectedBalance = lpBalance.mul(poolBalance).div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        strategy.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        lpTokenMock.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });
  });
});
