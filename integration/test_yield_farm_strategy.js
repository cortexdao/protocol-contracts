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
const {
  erc20,
  dai,
  mintERC20Tokens,
  getERC20Balance,
  undoErc20,
} = require("./utils");
const { advanceBlock } = require("@openzeppelin/test-helpers/src/time");

const APYManager = artifacts.require("APYManager");
const LeveragedYieldFarmStrategy = artifacts.require(
  "LeveragedYieldFarmStrategy"
);
const APT = artifacts.require("APT");
const APYLiquidityPool = artifacts.require("APYLiquidityPool");
const IMintableERC20 = artifacts.require("IMintableERC20");
const IERC20 = artifacts.require("IERC20");
const CErc20 = artifacts.require("CErc20");

// https://changelog.makerdao.com/releases/mainnet/latest/contracts.json
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // MCD_DAI
const DAI_MINTER_ADDRESS = "0x9759A6Ac90977b93B58547b4A71c78317f391A28"; // MCD_JOIN_DAI
const CDAI_ADDRESS = "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643";
const COMP_ADDRESS = "0xc00e94Cb662C3520282E6f5717214004A7f26888";

const ONE_INCH_ADDRESS = "0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e"; // 1proto.eth

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

  beforeEach(async () => {
    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    cDaiToken = await CErc20.at(CDAI_ADDRESS);
    compToken = await IERC20.at(COMP_ADDRESS);

    apt = await APT.new();
    pool = await APYLiquidityPool.new();
    strategy = await LeveragedYieldFarmStrategy.new();
    manager = await APYManager.new();

    await pool.setTokenAddress(apt.address);
    await apt.setPoolAddress(pool.address);

    await manager.setPoolAddress(pool.address);
    await pool.setManagerAddress(manager.address);

    await manager.setStrategyAddress(strategy.address);
    await strategy.setManagerAddress(manager.address);

    await strategy.setOneInchAddress(ONE_INCH_ADDRESS);
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
