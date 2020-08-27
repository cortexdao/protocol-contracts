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

const LeveragedYieldFarm = artifacts.require("LeveragedYieldFarm");
const IMintableERC20 = artifacts.require("IMintableERC20");
const CErc20 = artifacts.require("CErc20");

// https://changelog.makerdao.com/releases/mainnet/latest/contracts.json
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // MCD_DAI
const DAI_MINTER_ADDRESS = "0x9759A6Ac90977b93B58547b4A71c78317f391A28"; // MCD_JOIN_DAI
const CDAI_ADDRESS = "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643";

const timeout = 120000; // in millis

contract("LeveragedYieldFarm", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let farm;
  let daiToken;
  let cDaiToken;

  beforeEach(async () => {
    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    farm = await LeveragedYieldFarm.new();
    cDaiToken = await CErc20.at(CDAI_ADDRESS);

    await mintERC20Tokens(
      DAI_ADDRESS,
      farm.address,
      DAI_MINTER_ADDRESS,
      dai("10000")
    );

    const daiBalance = await daiToken.balanceOf(farm.address);
    console.log("       --->  DAI balance:", daiBalance.toString() / 1e18);
  });

  it("deposit DAI with flash loan", async () => {
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
  }).timeout(timeout);

  advanceBlock = () => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.sendAsync(
        {
          jsonrpc: "2.0",
          method: "evm_mine",
          id: new Date().getTime(),
        },
        (err, result) => {
          if (err) {
            return reject(err);
          }
          const newBlockHash = web3.eth.getBlock("latest").hash;

          return resolve(newBlockHash);
        }
      );
    });
  };
});
