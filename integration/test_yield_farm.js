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

const LeveragedYieldFarm = artifacts.require("LeveragedYieldFarm");
const IMintableERC20 = artifacts.require("IMintableERC20");
const IERC20 = artifacts.require("IERC20");
const CErc20 = artifacts.require("CErc20");

const {
  DAI_ADDRESS,
  DAI_MINTER_ADDRESS,
  CDAI_ADDRESS,
  COMP_ADDRESS,
} = require("../utils/constants");

const timeout = 960000; // in millis
const debug = true;

console.debug = (...args) => {
  if (debug) {
    console.log.apply(this, args);
  }
};

contract("LeveragedYieldFarm", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let daiToken;
  let cDaiToken;
  let compToken;
  let farm;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];

    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    cDaiToken = await CErc20.at(CDAI_ADDRESS);
    compToken = await IERC20.at(COMP_ADDRESS);
    farm = await LeveragedYieldFarm.new();
  });

  afterEach(async () => {
    // FIXME: for some reason, this makes the test fail
    // await timeMachine.revertToSnapshot(snapshotId);
  });

  it("farm COMP with DAI flash loan", async () => {
    const amount = dai("10000");
    await mintERC20Tokens(
      DAI_ADDRESS,
      farm.address,
      DAI_MINTER_ADDRESS,
      amount.addn(2) // need a bit extra for the flash loan "fee"
    );

    const receipt = await farm.initiatePosition(amount, {
      from: deployer,
      gas: 1000000,
    });
    console.debug("       --->  DAI deposited:", amount.toString() / 1e18);

    const borrowBalance = await cDaiToken.borrowBalanceCurrent.call(
      farm.address
    );
    console.debug(
      "       --->  DAI borrowed:",
      borrowBalance.toString() / 1e18
    );
    console.debug("");

    const cDaiBalance = await cDaiToken.balanceOf(farm.address);
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

    await farm.rebalance({ from: deployer, gas: 5000000 });

    await farm.closePosition({ from: deployer, gas: 2000000 });

    const compBalance = await compToken.balanceOf(deployer);
    console.debug("       --->  COMP balance:", compBalance.toString() / 1e18);

    const daiBalance = await daiToken.balanceOf(deployer);
    console.debug("       --->  DAI balance:", daiBalance.toString() / 1e18);
  }).timeout(timeout);
});
