#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.  Values are passed like so:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js --arg1=val1 --arg2=val2
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ MNEMONIC='' yarn fork:mainnet
 */
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = hre;
const { commify, formatUnits } = require("../../utils/helpers");
const {
  getAccountManager,
  getStrategyAccountInfo,
  getStablecoins,
} = require("./utils");
const { console } = require("./utils");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const accountManager = await getAccountManager(NETWORK_NAME);
  console.logAddress("AccountManager", accountManager.address);

  const [, accountAddress] = await getStrategyAccountInfo(NETWORK_NAME);

  const stablecoins = await getStablecoins(NETWORK_NAME);

  const daiToken = stablecoins["DAI"];
  const accDaiBal = await daiToken.balanceOf(accountAddress);
  console.log(`DAI Balance: ${commify(formatUnits(accDaiBal, 18))}`);

  const usdcToken = stablecoins["USDC"];
  const accUsdcBal = await usdcToken.balanceOf(accountAddress);
  console.log(`USDC Balance: ${commify(formatUnits(accUsdcBal, 6))}`);

  const usdtToken = stablecoins["USDT"];
  const accUsdtBal = await usdtToken.balanceOf(accountAddress);
  console.log(`USDT Balance: ${commify(formatUnits(accUsdtBal, 6))}`);
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
