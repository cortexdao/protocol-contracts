#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const { STABLECOIN_POOLS } = require("../../utils/constants");
const { acquireToken } = require("../../utils/helpers");
const { console, getStablecoins } = require("./utils");

console.debugging = true;

const AMOUNTS = {
  // in token units, not wei
  DAI: 100000,
  USDC: 100000,
  USDT: 100000,
};

async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  console.log("Acquire stablecoins for testing ...");
  const stablecoins = await getStablecoins(networkName);

  const testAccountIndex = argv.accountIndex || 0;
  console.log("Account index:", testAccountIndex);
  const signers = await ethers.getSigners();
  const tester = await signers[testAccountIndex].getAddress();
  console.logAddress("Recipient address", tester);

  for (const symbol of Object.keys(stablecoins)) {
    const token = stablecoins[symbol];
    let amount = AMOUNTS[symbol].toString();
    const sender = STABLECOIN_POOLS[symbol];
    await acquireToken(sender, tester, token, amount, tester);
  }
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
