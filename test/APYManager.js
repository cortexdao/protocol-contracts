const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const APYManager = artifacts.require("APYManager");
const MockContract = artifacts.require("MockContract");
const APYLiquidityPool = artifacts.require("APYLiquidityPool");
const APT = artifacts.require("APT");
const IStrategy = artifacts.require("IStrategy");

ZERO_ADDRESS = constants.ZERO_ADDRESS;
DUMMY_ADDRESS = "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE";

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;
  let strategy;
  let pool;
  let apt;

  const poolBalance = ether("1.75");

  beforeEach(async () => {
    manager = await APYManager.new();
    strategy = await getStrategyMock();
    await manager.setStrategyAddress(strategy.address);

    pool = await deployPoolWithEther(manager, poolBalance);
  });

  it("can enter strategy", async () => {
    const tracker = await balance.tracker(strategy.address);
    await manager.enterStrategy();

    expect(await getInvocationCount(strategy, "enter")).to.bignumber.equal(
      "1",
      "enterStrategy should call strategy.enter"
    );
    expect(await balance.current(pool.address)).to.bignumber.equal(
      "0",
      "Pool should have no ETH."
    );
    expect(await tracker.delta()).to.bignumber.equal(
      poolBalance,
      "Strategy balance should increase by pool balance."
    );
  });

  it("can exit strategy", async () => {
    await manager.exitStrategy();

    expect(await getInvocationCount(strategy, "exit")).to.bignumber.equal(
      "1",
      "exitStrategy should call strategy.exit"
    );
  });

  it("can reinvest strategy using unused ETH", async () => {
    const tracker = await balance.tracker(strategy.address);
    await manager.reinvestStrategy();

    expect(await getInvocationCount(strategy, "reinvest")).to.bignumber.equal(
      "1",
      "reinvestStrategy should call strategy.reinvest"
    );
    expect(await balance.current(pool.address)).to.bignumber.equal(
      "0",
      "Pool should have no ETH."
    );
    expect(await tracker.delta()).to.bignumber.equal(
      poolBalance,
      "Strategy balance should increase by pool balance."
    );
  });

  const getStrategyMock = async () => {
    const mock = await MockContract.new();
    strategy = await IStrategy.at(mock.address);
    strategy._mock = mock;
    return strategy;
  };

  const getInvocationCount = async (strategyMock, methodName) => {
    let methodAbi;
    switch (methodName) {
      case "enter":
        methodAbi = strategyMock.contract.methods.enter().encodeABI();
        break;
      case "exit":
        methodAbi = strategyMock.contract.methods.exit().encodeABI();
        break;
      case "reinvest":
        methodAbi = strategyMock.contract.methods.reinvest().encodeABI();
        break;
      default:
        throw Error("methodName not recognized.");
    }

    return await strategyMock._mock.invocationCountForMethod.call(methodAbi);
  };

  const getEvent = (receipt, eventName) => {
    const events = receipt.logs.filter((e) => e.event === eventName);
    return events;
  };

  const deployPoolWithEther = async (apyManager, ethAmount) => {
    const pool = await APYLiquidityPool.new();
    const apt = await APT.new();

    await pool.setTokenAddress(apt.address, { from: deployer });
    await apt.setPoolAddress(pool.address, { from: deployer });

    await pool.setManagerAddress(apyManager.address, { from: deployer });
    await manager.setPoolAddress(pool.address, { from: deployer });

    await send.ether(other, pool.address, ethAmount);

    return pool;
  };
});
