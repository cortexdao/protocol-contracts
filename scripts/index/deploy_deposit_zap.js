#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs").option("compile", {
  type: "boolean",
  default: true,
  description: "Compile contract using `compile:one`",
});
const hre = require("hardhat");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  MAX_UINT256,
} = require("../../utils/helpers");
const { ethers } = hre;

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_WHALE_ADDRESS = "0x0a59649758aa4d66e25f08dd01271e891fe52199"; // Maker PSM

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const [deployer, alice] = await ethers.getSigners();

  const usdcWhale = await impersonateAccount(USDC_WHALE_ADDRESS, 100);

  /*
   * Deploy Deposit Zap
   */
  const nonce = await deployer.getTransactionCount();
  // // Grab the previously deployed index token address, assuming
  // // nonce should be decremented twice to account for index token deploy and initialize
  // // and factory pool deploy.
  // // Expected to be: 0x82E4bb17a00B32e5672d5EBe122Cd45bEEfD32b3
  // // If not, adjust this accordingly.
  // const indexTokenAddress = ethers.utils.getContractAddress({
  //   from: deployer.address,
  //   nonce: nonce - 3,
  // });
  const indexTokenAddress = "0x82E4bb17a00B32e5672d5EBe122Cd45bEEfD32b3";
  console.log("Index token: %s", indexTokenAddress);
  const indexToken = await ethers.getContractAt(
    "IndexToken",
    indexTokenAddress
  );

  const DepositZap = await ethers.getContractFactory("DepositZap");
  const depositZap = await DepositZap.deploy(indexTokenAddress);
  await depositZap.deployed();
  console.log("Deposit zap: %s", depositZap.address);

  const usdc = await ethers.getContractAt("IDetailedERC20", USDC_ADDRESS);
  const depositAmount = tokenAmountToBigNumber("10000", 6);
  await usdc.connect(usdcWhale).transfer(alice.address, depositAmount);

  await usdc.connect(alice).approve(depositZap.address, MAX_UINT256);
  await depositZap.connect(alice).deposit(depositAmount, 1);
  console.log(
    "Alice index token balance: %s",
    (await indexToken.balanceOf(alice.address)) / 10 ** 18
  );
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Deployed deposit zap.");
      console.log("");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
