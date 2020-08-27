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
} = require("./utils");

const APYManager = artifacts.require("APYManagerTestProxy");
const IOneSplit = artifacts.require("IOneSplit");
const IMintableERC20 = artifacts.require("IMintableERC20");

/* 
These contracts move around with some frequency.  If you run into a
"no code at <address>" error, you should double-check these etherscan
urls for the versions of OneSplitAudit:

latest version: https://etherscan.io/address/1split.eth
beta version: https://etherscan.io/address/1proto.eth
*/
const ONE_INCH_ADDRESS = "0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e"; // 1proto.eth

// https://changelog.makerdao.com/releases/mainnet/latest/contracts.json
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // MCD_DAI
const DAI_MINTER_ADDRESS = "0x9759A6Ac90977b93B58547b4A71c78317f391A28"; // MCD_JOIN_DAI

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BAL_ADDRESS = "0xba100000625a3754423978a60c9317c58a424e3D";

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

contract("1inch", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let oneInch;

  beforeEach(async () => {
    oneInch = await IOneSplit.at(ONE_INCH_ADDRESS);
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

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;

  beforeEach(async () => {
    apyManager = await APYManager.new();
    await apyManager.setOneInchAddress(ONE_INCH_ADDRESS, { from: deployer });
  });

  it("can swap ETH for ERC20", async () => {
    // manager needs ether since we swap ETH for DAI
    send.ether(wallet, apyManager.address, ether("1"));

    const fromToken = constants.ZERO_ADDRESS; // ETH
    const destToken = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
    const amount = ether("1");

    await apyManager.setOneInchFlags(UNISWAP_V1_ONLY, { from: deployer });

    try {
      await apyManager.swap(fromToken, destToken, amount);
    } catch {
      assert.fail("Calling swap on APYManager failed.");
    }
    const toBalance = await getERC20Balance(destToken, apyManager.address);
    expect(toBalance).to.bignumber.gt("0", "Did not receive any DAI");
  }).timeout(timeout);

  it("can swap ERC20 tokens", async () => {
    const fromToken = DAI_ADDRESS; // DAI
    const destToken = USDC_ADDRESS;
    // const destToken = BAL_ADDRESS;
    const amount = erc20("100");

    await mintERC20Tokens(
      fromToken,
      apyManager.address,
      DAI_MINTER_ADDRESS,
      amount
    );
    await getERC20Balance(fromToken, apyManager.address);
    await getERC20Balance(destToken, apyManager.address);

    await apyManager.setOneInchFlags(UNISWAP_V1_ONLY, { from: deployer });

    try {
      await apyManager.swap(fromToken, destToken, amount);
    } catch (error) {
      console.log(error);
      assert.fail("Calling swap on APYManager failed.");
    }
    await getERC20Balance(fromToken, apyManager.address);
    const toBalance = await getERC20Balance(destToken, apyManager.address);
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