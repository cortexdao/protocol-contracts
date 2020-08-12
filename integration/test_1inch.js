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
const { assertion } = require("@openzeppelin/test-helpers/src/expectRevert");

const APYManager = artifacts.require("APYManagerTestProxy");
const IOneSplit = artifacts.require("IOneSplit");

// https://etherscan.io/address/1split.eth
const ONE_INCH_ADDRESS = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";

contract("1inch", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let oneInch;

  beforeEach(async () => {
    oneInch = await IOneSplit.at(ONE_INCH_ADDRESS);
  });

  it("can interact with 1inch contract", async () => {
    const fromToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const destToken = "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359";
    const amount = new BN("100");
    const parts = 10;
    const flags = 0;
    try {
      await oneInch.getExpectedReturn(
        fromToken,
        destToken,
        amount,
        parts,
        flags
      );
    } catch {
      assert.fail("Call on 1inch contract failed.");
    }
  });
});

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;

  beforeEach(async () => {
    apyManager = await APYManager.new();
    await apyManager.setOneInchAddress(ONE_INCH_ADDRESS, { from: deployer });
  });

  it("manager can swap on 1inch", async () => {
    await send.ether(wallet, apyManager.address, ether("1"));

    const fromToken = constants.ZERO_ADDRESS;
    const destToken = "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359";
    const amount = ether("0.0001");
    const parts = 10;
    const flags = 0;
    const slippage = 200;
    try {
      await apyManager.swap(fromToken, destToken, amount, slippage, {
        from: wallet,
      });
    } catch {
      assert.fail("Calling swap on APYManager failed.");
    }
  });
});
