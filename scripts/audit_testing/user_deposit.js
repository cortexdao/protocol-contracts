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
const chalk = require("chalk");
const { getApyPool, getStablecoins } = require("./utils");
const { tokenAmountToBigNumber } = require("../../utils/helpers");

console.logAddress = function (contractName, contractAddress) {
  contractName = contractName + ":";
  contractAddress = chalk.green(contractAddress);
  console.log.apply(this, [contractName, contractAddress]);
};

console.logDone = function () {
  console.log("");
  console.log.apply(this, [chalk.green("√") + " ... done."]);
  console.log("");
};

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  const symbol = (argv.pool || "DAI").toUpperCase();
  const stablecoins = await getStablecoins(networkName);
  const underlyerToken = stablecoins[symbol];
  const decimals = await underlyerToken.decimals();

  const userBalance = await underlyerToken.balanceOf(user.address);
  console.log(`${symbol} balance: ${userBalance}`);

  const amount = tokenAmountToBigNumber(argv.amount || "1000", decimals);

  const pool = await getApyPool(networkName, symbol);

  console.log("");
  console.log(`Depositing ${amount} into ${symbol} pool ...`);
  console.log("");

  await underlyerToken.approve(pool.address, amount);
  await pool.addLiquidity(amount);

  console.logDone();
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Execution successful.");
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
