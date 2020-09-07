const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  erc20,
  dai,
  mintERC20Tokens,
  getERC20Balance,
  undoErc20,
} = require("../utils/helpers");
const { advanceBlock } = require("@openzeppelin/test-helpers/src/time");
const {
  DAI_ADDRESS,
  CDAI_ADDRESS,
  COMP_ADDRESS,
  ONE_SPLIT_ADDRESS,
  COMPTROLLER_ADDRESS,
} = require("../utils/constants");

const APYManager = artifacts.require("APYManager");
const LeveragedYieldFarmStrategy = artifacts.require(
  "LeveragedYieldFarmStrategy"
);
const APT = artifacts.require("APT");
const APYLiquidityPool = artifacts.require("APYLiquidityPool");
const IMintableERC20 = artifacts.require("IMintableERC20");
const IERC20 = artifacts.require("IERC20");
const CErc20 = artifacts.require("CErc20");

const timeout = 960000; // in millis
const debug = false;

console.debug = (...args) => {
  if (debug) {
    console.log.apply(this, args);
  }
};

contract("LeveragedYieldFarmStrategy", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let daiToken;
  let cDaiToken;
  let compToken;

  let apt;
  let pool;
  let strategy;
  let manager;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];

    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    cDaiToken = await CErc20.at(CDAI_ADDRESS);
    compToken = await IERC20.at(COMP_ADDRESS);

    apt = await APT.new();
    pool = await APYLiquidityPool.new();
    strategy = await LeveragedYieldFarmStrategy.new(
      DAI_ADDRESS,
      CDAI_ADDRESS,
      COMP_ADDRESS,
      COMPTROLLER_ADDRESS
    );
    manager = await APYManager.new();

    await pool.setTokenAddress(apt.address);
    await apt.setPoolAddress(pool.address);

    await manager.setPoolAddress(pool.address);
    await pool.setManagerAddress(manager.address);

    await manager.setStrategyAddress(strategy.address);
    await strategy.setManagerAddress(manager.address);

    await strategy.setOneInchAddress(ONE_SPLIT_ADDRESS);
  });

  afterEach(async () => {
    // FIXME: for some reason, this makes the test fail
    //await timeMachine.revertToSnapshot(snapshotId);
  });

  it("farm COMP with DAI flash loan", async () => {
    const amount = ether("10").addn(1); // add extra wei for flash loan fee
    await pool.addLiquidity({ from: wallet, value: amount });

    const receipt = await manager.enterStrategy({
      from: deployer,
      gas: 6000000,
    });
    console.debug("       --->  DAI deposited:", amount.toString() / 1e18);

    const borrowBalance = await cDaiToken.borrowBalanceCurrent.call(
      manager.address
    );
    console.debug(
      "       --->  DAI borrowed:",
      borrowBalance.toString() / 1e18
    );
    console.debug("");

    const cDaiBalance = await cDaiToken.balanceOf(manager.address);
    const exchangeRate = await cDaiToken.exchangeRateCurrent.call();
    console.debug(
      "       --->  cDAI/DAI rate:",
      exchangeRate.toString() / 1e28
    );
    console.debug("       --->  cDAI balance:", cDaiBalance.toString() / 1e8);
    console.debug(
      "       --->  total DAI locked:",
      cDaiBalance.mul(exchangeRate).toString() / 1e36
    );
    console.debug("");

    numBlocksInPeriod = 4 * 60; // hour
    const futureBlockHeight = (await time.latestBlock()).addn(
      numBlocksInPeriod
    );
    await time.advanceBlockTo(futureBlockHeight);
    console.debug(`       ... ${numBlocksInPeriod} blocks mined.`);

    await manager.reinvestStrategy({ from: deployer, gas: 5000000 });

    await manager.exitStrategy({ from: deployer, gas: 2000000 });

    const compBalance = await compToken.balanceOf(deployer);
    console.debug("       --->  COMP balance:", compBalance.toString() / 1e18);

    const daiBalance = await daiToken.balanceOf(deployer);
    console.debug("       --->  DAI balance:", daiBalance.toString() / 1e18);
  }).timeout(timeout);
});
