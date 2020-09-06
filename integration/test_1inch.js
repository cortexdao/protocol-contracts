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
const {
  erc20,
  dai,
  mintERC20Tokens,
  getERC20Balance,
  undoErc20,
} = require("../utils/helpers");

const OneInchSwap = artifacts.require("OneInchSwapTestProxy");
const IOneSplit = artifacts.require("IOneSplit");
const IMintableERC20 = artifacts.require("IMintableERC20");

const {
  ONE_SPLIT_ADDRESS,
  DAI_ADDRESS,
  DAI_MINTER_ADDRESS,
  USDC_ADDRESS,
} = require("../utils/constants");

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
const CURVE_ONLY = DISABLE_ALL.add(CURVE_ALL);

const timeout = 35000; // in millis

contract("OneSplit", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let oneInch;

  beforeEach(async () => {
    oneInch = await IOneSplit.at(ONE_SPLIT_ADDRESS);
  });

  it("can swap ETH for ERC20", async () => {
    const fromToken = constants.ZERO_ADDRESS; // ETH
    const destToken = DAI_ADDRESS; // DAI
    const amount = ether("1");
    let parts = 10;
    let flags = UNISWAP_V1_ONLY;

    let res;
    try {
      res = await oneInch.getExpectedReturn(
        fromToken,
        destToken,
        amount,
        parts,
        flags
      );
    } catch {
      assert.fail("Calling getExpectedReturn on 1inch failed.");
    }

    console.log(
      "       --->  returnAmount:",
      res.returnAmount.toString() / 1e18 + " DAI"
    );
    const returnAmount = res.returnAmount;
    const distribution = res.distribution;

    try {
      const receivedAmount = await oneInch.swap.call(
        fromToken,
        destToken,
        amount,
        returnAmount,
        distribution,
        flags,
        { from: wallet, value: amount }
      );
      console.log(
        "       --->  receivedAmount:",
        receivedAmount.toString() / 1e18 + " DAI"
      );
    } catch {
      assert.fail("Calling swap on 1inch failed.");
    }
  }).timeout(timeout);

  it("can swap ERC20 tokens", async () => {
    const fromToken = DAI_ADDRESS; // DAI
    const destToken = USDC_ADDRESS;
    const amount = erc20("100", "18");
    let parts = 10;
    let flags = UNISWAP_V1_ONLY;

    let res;
    try {
      res = await oneInch.getExpectedReturn(
        fromToken,
        destToken,
        amount,
        parts,
        flags
      );
    } catch {
      assert.fail("Calling getExpectedReturn on 1inch failed.");
    }

    console.log(
      "       --->  returnAmount:",
      res.returnAmount.toString() / 1e6 + " USDC"
    );
    const returnAmount = res.returnAmount;
    const distribution = res.distribution;

    await mintERC20Tokens(fromToken, wallet, DAI_MINTER_ADDRESS, amount);
    const fromBalance = await getERC20Balance(fromToken, wallet);
    await getERC20Balance(destToken, wallet);

    const daiToken = await IMintableERC20.at(DAI_ADDRESS);
    await daiToken.approve(oneInch.address, fromBalance, { from: wallet });

    try {
      const receivedAmount = await oneInch.swap.call(
        fromToken,
        destToken,
        amount,
        returnAmount,
        distribution,
        flags,
        { from: wallet }
      );
      console.log(
        "       --->  receivedAmount:",
        receivedAmount.toString() / 1e6 + " USDC"
      );
    } catch {
      assert.fail("Calling swap on 1inch failed.");
    }
  }).timeout(timeout);
});

contract("OneInchSwap", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let oneInchSwap;

  beforeEach(async () => {
    oneInchSwap = await OneInchSwap.new();
    await oneInchSwap.setOneInchAddress(ONE_SPLIT_ADDRESS, { from: deployer });
  });

  it("can swap ETH for ERC20", async () => {
    // manager needs ether since we swap ETH for DAI
    send.ether(wallet, oneInchSwap.address, ether("1"));

    const fromToken = constants.ZERO_ADDRESS; // ETH
    const destToken = DAI_ADDRESS;
    const amount = ether("1");

    await oneInchSwap.setOneInchFlags(UNISWAP_V1_ONLY, { from: deployer });

    try {
      await oneInchSwap.swap(fromToken, destToken, amount);
    } catch {
      assert.fail("Calling swap on OneInchSwap failed.");
    }
    const toBalance = await getERC20Balance(destToken, oneInchSwap.address);
    expect(toBalance).to.bignumber.gt("0", "Did not receive any DAI");
  }).timeout(timeout);

  it("can swap ERC20 tokens", async () => {
    const fromToken = DAI_ADDRESS; // DAI
    const destToken = USDC_ADDRESS;
    // const destToken = BAL_ADDRESS;
    const amount = erc20("100");

    await mintERC20Tokens(
      fromToken,
      oneInchSwap.address,
      DAI_MINTER_ADDRESS,
      amount
    );
    await getERC20Balance(fromToken, oneInchSwap.address);
    await getERC20Balance(destToken, oneInchSwap.address);

    await oneInchSwap.setOneInchFlags(UNISWAP_V1_ONLY, { from: deployer });

    try {
      await oneInchSwap.swap(fromToken, destToken, amount);
    } catch (error) {
      console.log(error);
      assert.fail("Calling swap on OneInchSwap failed.");
    }
    await getERC20Balance(fromToken, oneInchSwap.address);
    const toBalance = await getERC20Balance(destToken, oneInchSwap.address);
    expect(toBalance).to.bignumber.gt("0", "Did not receive any USDC");
    // converting from DAI to USDC shouldn't change amount much
    const tolerance = "10";
    const adjToBalance = undoErc20(toBalance, "6");
    const adjAmount = undoErc20(amount, "18");
    expect(adjToBalance.sub(adjAmount).abs()).to.bignumber.lt(
      tolerance,
      "sent and received amounts differ by more than tolerance."
    );
  }).timeout(60000);
});
