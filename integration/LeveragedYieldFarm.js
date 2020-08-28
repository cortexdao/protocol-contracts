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

const LeveragedYieldFarm = artifacts.require("LeveragedYieldFarm");
const IMintableERC20 = artifacts.require("IMintableERC20");
const IERC20 = artifacts.require("IERC20");
const CErc20 = artifacts.require("CErc20");

// https://changelog.makerdao.com/releases/mainnet/latest/contracts.json
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // MCD_DAI
const DAI_MINTER_ADDRESS = "0x9759A6Ac90977b93B58547b4A71c78317f391A28"; // MCD_JOIN_DAI
const CDAI_ADDRESS = "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643";
const COMP_ADDRESS = "0xc00e94Cb662C3520282E6f5717214004A7f26888";

const timeout = 120000; // in millis

contract("LeveragedYieldFarm", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let farm;
  let daiToken;
  let cDaiToken;
  let compToken;

  beforeEach(async () => {
    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    farm = await LeveragedYieldFarm.new();
    cDaiToken = await CErc20.at(CDAI_ADDRESS);
    compToken = await IERC20.at(COMP_ADDRESS);

    await mintERC20Tokens(
      DAI_ADDRESS,
      farm.address,
      DAI_MINTER_ADDRESS,
      dai("10000")
    );

    const daiBalance = await daiToken.balanceOf(farm.address);
    console.log("       --->  DAI balance:", daiBalance.toString() / 1e18);
  });

  it("farm COMP with DAI flash loan", async () => {
    const amount = dai("100");
    console.log("       --->  DAI deposited:", amount.toString() / 1e18);

    const receipt = await farm.depositDai(amount, {
      from: deployer,
      gas: 1000000,
    });

    const borrowBalance = await cDaiToken.borrowBalanceCurrent.call(
      farm.address
    );
    console.log("       --->  DAI borrowed:", borrowBalance.toString() / 1e18);
    console.log("");

    const cDaiBalance = await cDaiToken.balanceOf(farm.address);
    const exchangeRate = await cDaiToken.exchangeRateCurrent.call();
    console.log("       --->  cDAI/DAI rate:", exchangeRate.toString() / 1e28);
    console.log("       --->  cDAI balance:", cDaiBalance.toString() / 1e8);
    console.log(
      "       --->  total DAI locked:",
      cDaiBalance.mul(exchangeRate).toString() / 1e36
    );
    console.log("");

    blocksPerDay = 4 * 60 * 24;
    blocksPerWeek = 7 * blocksPerDay;
    for (i = 0; i < blocksPerDay; i++) {
      await time.advanceBlock();
    }
    console.log("       --->  Number of blocks waited:", blocksPerDay);

    await farm.withdrawDai(amount, { from: deployer, gas: 2000000 });

    const compBalance = await compToken.balanceOf(deployer);
    console.log("       --->  COMP balance:", compBalance.toString() / 1e18);
  }).timeout(timeout);
});
