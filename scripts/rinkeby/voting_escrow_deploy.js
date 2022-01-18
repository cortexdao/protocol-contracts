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

const ADMIN_SAFE_ADDRESS = "0xacC66a1bD538cfCBB801FC047f41A3FC0AECf87a";

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

  const balance =
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
  const votingEscrow = await contractFactory.deploy(
    APY_ADDRESS,
    NAME,
    SYMBOL,
    VERSION
  );
  console.log("Contract address: %s", votingEscrow.address);

  console.log("Waiting for 5 confirmations ...");
  await votingEscrow.deployTransaction.wait(5);

  console.log("Commit transfer ownership ...");
  let tx = await votingEscrow
    .connect(deployer)
    .commit_transfer_ownership(ADMIN_SAFE_ADDRESS);
  console.log("Waiting for 5 confirmations ...");
  await tx.wait(5);

  console.log("Apply transfer ownership ...");
  tx = await votingEscrow.connect(deployer).apply_transfer_ownership();
  console.log("Waiting for 5 confirmations ...");
  await tx.wait(5);
  console.log("Done.");

  console.log("Verify manually on the etherscan website.");
  // can't verify vyper contracts through hardhat; must do through
  // Etherscan website using this bytecode for the constructor args:
  //
  // vyper version 0.2.4
  // 000000000000000000000000a41d3d461b8a9f1e9f92d2b040495ce21cfed548000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000010426f6f73742d4c6f636b656420415059000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005626c4150590000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005312e302e30000000000000000000000000000000000000000000000000000000
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
