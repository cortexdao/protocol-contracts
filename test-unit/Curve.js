const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
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

    before(async () => {
      lpTokenMock = await deployMockContract(deployer, IDetailedERC20.abi);

      stableSwapMock = await deployMockContract(deployer, IStableSwap.abi);
      await stableSwapMock.mock.lp_token.returns(lpTokenMock.address);

      liquidityGaugeMock = await deployMockContract(
        deployer,
        ILiquidityGauge.abi
      );
    });

    it("Get underlyer balance from strategy holding", async () => {
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      await stableSwapMock.mock.N_COINS.returns(4);
      const strategyLpBalance = tokenAmountToBigNumber(500);
      await lpTokenMock.mock.balanceOf
        .withArgs(strategy.address)
        .returns(strategyLpBalance);
      const lpTotalSupply = tokenAmountToBigNumber(1000);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
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
        0
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      await stableSwapMock.mock.balances.returns(1000);
      await stableSwapMock.mock.N_COINS.returns(4);
      await lpTokenMock.mock.balanceOf.returns(500);
      await lpTokenMock.mock.totalSupply.returns(1000);
      await liquidityGaugeMock.mock.balanceOf.returns(1000);

      const balance = await curve.getUnderlyerBalance(
        deployer.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        0
      );
      expect(balance).to.equal(500);
    });

    it("Get underlyer balance from combined holdings", async () => {
      await stableSwapMock.mock.balances.returns(1000);
      await stableSwapMock.mock.N_COINS.returns(4);
      await lpTokenMock.mock.balanceOf.returns(500);
      await lpTokenMock.mock.totalSupply.returns(1000);
      await liquidityGaugeMock.mock.balanceOf.returns(1000);

      const balance = await curve.getUnderlyerBalance(
        deployer.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        0
      );
      expect(balance).to.equal(500);
    });
  });
});
