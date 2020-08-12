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

// latest version: https://etherscan.io/address/1split.eth
// const ONE_INCH_ADDRESS = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
//beta version: https://etherscan.io/address/1proto.eth
const ONE_INCH_ADDRESS = "0x6cb2291A3c3794fcA0F5b6E34a8E6eA7933CA667";

// DISABLE flags
const DISABLE_ALL = new BN("20000000", 16).add(new BN("40000000", 16));
const CURVE_SYNTHETIX = new BN("40000", 16);
const CURVE_COMPOUND = new BN("1000", 16);
const CURVE_ALL = new BN("200000000000", 16);
const KYBER_ALL = new BN("200000000000000", 16);
const MOONISWAP_ALL = new BN("8000000000000000", 16);
const BALANCER_ALL = new BN("1000000000000", 16);

// ENABLE flags
const UNISWAP_V1_ONLY = DISABLE_ALL.addn(1);
const BALANCER_ONLY = DISABLE_ALL.add(BALANCER_ALL);
const MOONISWAP_ONLY = DISABLE_ALL.add(MOONISWAP_ALL);

const dai = ether;

contract("1inch", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let oneInch;

  beforeEach(async () => {
    oneInch = await IOneSplit.at(ONE_INCH_ADDRESS);
  });

  it("can interact with 1inch contract", async () => {
    const fromToken = constants.ZERO_ADDRESS; // ETH
    const destToken = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
    const amount = ether("1");
    let parts = 10;
    let flags = UNISWAP_V1_ONLY;
    // let flags = BALANCER_ONLY;
    // flags = MOONISWAP_ONLY;

    const res = await oneInch.getExpectedReturn(
      fromToken,
      destToken,
      amount,
      parts,
      flags
    );

    console.log(
      "       --->  returnAmount:",
      res.returnAmount.toString() / 1e18 + " DAI"
    );
    // console.log(
    //   "distribution:",
    //   res.distribution.map((a) => a.toString())
    // );
    const returnAmount = res.returnAmount;
    const distribution = res.distribution;
    // const minAmount = returnAmount.sub(new BN("50e18"));
    const minAmount = returnAmount.sub(dai("50"));

    const receivedAmount = await oneInch.swap.call(
      fromToken,
      destToken,
      amount,
      minAmount,
      distribution,
      flags,
      { from: wallet, value: amount }
    );
    console.log(
      "       --->  receivedAmount:",
      receivedAmount.toString() / 1e18 + " DAI"
    );
  }).timeout(120000);
});

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;

  beforeEach(async () => {
    apyManager = await APYManager.new();
    await apyManager.setOneInchAddress(ONE_INCH_ADDRESS, { from: deployer });
  });

  it("manager can swap on 1inch", async () => {
    // manager needs ether since we swap ETH for DAI
    send.ether(wallet, apyManager.address, ether("1"));

    const fromToken = constants.ZERO_ADDRESS; // ETH
    const destToken = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
    const amount = ether("1");
    const slippage = new BN("150"); // in basis points

    await apyManager.setOneInchParts(10, { from: deployer });
    // await apyManager.setOneInchFlags(UNISWAP_V1_ONLY, { from: deployer });
    await apyManager.setOneInchFlags(BALANCER_ONLY, { from: deployer });
    // await apyManager.setOneInchFlags(MOONISWAP_ONLY, { from: deployer });

    try {
      const receivedAmount = await apyManager.swap.call(
        fromToken,
        destToken,
        amount,
        slippage
      );
      console.log("       --->  swap result:", receivedAmount / 1e18 + " DAI");
    } catch {
      assert.fail("Calling swap on APYManager failed.");
    }
  }).timeout(120000);
});
