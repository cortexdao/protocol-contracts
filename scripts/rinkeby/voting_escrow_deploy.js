#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");

const APY_ADDRESS = "0xA41d3d461B8a9f1E9F92d2B040495cE21CfED548";
const NAME = "Boost-Locked APY";
const SYMBOL = "blAPY";
const VERSION = "1.0.0";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const deployer = new ethers.Wallet(
    process.env.SAFE_OWNER_KEY,
    ethers.provider
  );
  console.log("Deployer address:", deployer.address);
  console.log("");

  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");

  const contractName = "VotingEscrow";
  console.log(`${contractName} deploy`);
  console.log("");

  console.log("Deploying ... ");
  console.log("");

  const contractFactory = await ethers.getContractFactory(
    contractName,
    deployer
  );
  let votingEscrow = await contractFactory.deploy(
    APY_ADDRESS,
    NAME,
    SYMBOL,
    VERSION
  );
  console.log("Contract address: %s", votingEscrow.address);

  console.log("Waiting for 5 confirmations ...");
  await ethers.provider.waitForTransaction(
    votingEscrow.deployTransaction.hash,
    5
  );
  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: votingEscrow.address,
    constructorArguments: [APY_ADDRESS, NAME, SYMBOL, VERSION],
  });
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Contract deployed.");
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
