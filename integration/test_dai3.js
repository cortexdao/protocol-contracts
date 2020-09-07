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

const IOneSplit = artifacts.require("IOneSplit");
const Comptroller = artifacts.require("Comptroller");
const CErc20 = artifacts.require("CErc20");
const IERC20 = artifacts.require("IERC20");
const IMintableERC20 = artifacts.require("IMintableERC20");
const DAI3Strategy = artifacts.require("DAI3Strategy");

const {
  ONE_SPLIT_ADDRESS,
  DAI_ADDRESS,
  DAI_MINTER_ADDRESS,
  COMPTROLLER_ADDRESS,
  CDAI_ADDRESS,
  COMP_ADDRESS,
} = require("../utils/constants");

const timeout = 120000; // in millis

const debug = false;

console.debug = (...args) => {
  if (debug) {
    console.log.apply(this, args);
  }
};

contract("DAI3 Strategy", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let comptroller;
  let cDaiToken;
  let dai3Strategy;
  let daiToken;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];

    comptroller = await Comptroller.at(COMPTROLLER_ADDRESS);
    cDaiToken = await CErc20.at(CDAI_ADDRESS);
    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    compToken = await IERC20.at(COMP_ADDRESS);

    dai3Strategy = await DAI3Strategy.new();
    await dai3Strategy.setOneInchAddress(ONE_SPLIT_ADDRESS);

    await mintERC20Tokens(
      DAI_ADDRESS,
      dai3Strategy.address,
      DAI_MINTER_ADDRESS,
      dai("10000")
    );
  });

  afterEach(async () => {
    // FIXME: for some reason, this makes the test fail
    // await timeMachine.revertToSnapshot(snapshotId);
  });

  it("should mint cDAI and borrow DAI", async () => {
    const amount = dai("1000");
    console.debug("       --->  DAI deposit:", amount.toString() / 1e18);
    const borrows = await dai3Strategy.depositAndBorrow.call(
      amount,
      amount.divn(2)
    );
    console.debug("       --->  DAI borrow:", borrows.toString() / 1e18);
  });

  it("should releverage DAI", async () => {
    const amount = dai("100");
    console.debug("       --->  DAI supply:", amount.toString() / 1e18);
    const numBorrows = 15;
    await dai3Strategy.setNumberOfBorrows(numBorrows);
    console.debug("       --->  times borrowed:", numBorrows.toString());
    const receipt = await dai3Strategy.borrowDai(amount, {
      from: wallet,
      gas: 8000000,
    });

    const borrowEvents = getEvent(receipt, "BorrowedDai");
    expect(borrowEvents.length).to.equal(
      numBorrows,
      "Incorrect number of borrow events found."
    );
    for (i = 0; i < borrowEvents.length; i++) {
      const eventArgs = borrowEvents[i].args;
      console.debug("       --->  Borrow event:");
      console.debug(
        "       --->    borrowFactor:",
        eventArgs.borrowFactor.toString() / 2 ** 64
      );
      console.debug(
        "       --->    liquidity:",
        eventArgs.liquidity.toString() / 1e18
      );
      console.debug(
        "       --->    shortfall:",
        eventArgs.shortfall.toString() / 1e18
      );
      console.debug(
        "       --->    borrowAmount:",
        eventArgs.borrowAmount.toString() / 1e18
      );
      console.debug("");
    }
    const borrows = await cDaiToken.borrowBalanceCurrent.call(
      dai3Strategy.address
    );
    console.debug("       --->  borrow balance:", borrows.toString() / 1e18);
    console.debug("");

    numBlocksInPeriod = 4 * 60; // hour
    const futureBlockHeight = (await time.latestBlock()).addn(
      numBlocksInPeriod
    );
    await time.advanceBlockTo(futureBlockHeight);
    console.debug(`       ... ${numBlocksInPeriod} blocks mined.`);

    await dai3Strategy.rebalance({
      from: wallet,
      gas: 12000000,
    });
    const borrowsAfterRebalance = await cDaiToken.borrowBalanceCurrent.call(
      dai3Strategy.address
    );
    // FIXME: this will be true always because "borrows" will gain interest
    // after ganache mines one block for the rebalance.
    expect(borrowsAfterRebalance).to.be.bignumber.gt(borrows);

    await dai3Strategy.repayBorrow();
    daiBalance = await daiToken.balanceOf(dai3Strategy.address);
    expect(await cDaiToken.balanceOf(dai3Strategy.address)).to.bignumber.equal(
      "0"
    );
    expect(await daiToken.balanceOf(dai3Strategy.address)).to.bignumber.equal(
      "0"
    );
    expect(await compToken.balanceOf(dai3Strategy.address)).to.bignumber.equal(
      "0"
    );
  }).timeout(timeout);

  const getEvent = (receipt, eventName) => {
    const events = receipt.logs.filter((e) => e.event === eventName);
    return events;
  };
});
