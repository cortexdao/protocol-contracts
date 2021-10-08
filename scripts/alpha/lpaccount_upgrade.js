#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
const { argv } = require("yargs").option("maxFeePerGas", {
  type: "number",
  description: "Gas price in gwei; omitting uses default Ethers logic",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const networkName = network.name.toUpperCase();
  if (!["KOVAN", "MAINNET"].includes(networkName)) return;

  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  await hre.run("clean");
  await hre.run("compile");
  await hre.run("compile:one", { contractName: "LpAccount" });
  console.log("Deploying ...");
  const LpAccount = await ethers.getContractFactory("LpAccount");

  let maxFeePerGas;
  if (argv.maxFeePerGas) {
    maxFeePerGas = ethers.BigNumber.from(argv.maxFeePerGas * 1e9);
  } else {
    maxFeePerGas = (await ethers.provider.getFeeData()).maxFeePerGas;
    maxFeePerGas = maxFeePerGas.mul(85).div(100);
  }
  const lpAccount = await LpAccount.deploy({ maxFeePerGas });
  await lpAccount.deployed();
  console.log("Deployed.");

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      lpAccount.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: lpAccount.address,
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Verification successful.");
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
