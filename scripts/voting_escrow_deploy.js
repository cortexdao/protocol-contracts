#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs")
  .option("name", {
    type: "string",
    description: "Zap contract name",
  })
  .option("compile", {
    type: "boolean",
    default: true,
    description: "Compile contract using `compile:one`",
  })
  .demandOption(["name"]);
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  waitForSafeTxReceipt,
  getAdminSafeSigner,
} = require("../../utils/helpers");

const APY_ADDRESS = "0x95a4411";
const NAME = "Boost-Locked APY";
const SYMBOL = "blAPY";
const VERSION = "1.0.0";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const safeSigner = await getAdminSafeSigner(networkName);

  const contractName = "VotingEscrow";
  console.log(`${contractName} deploy`);
  console.log("");

  if (argv.compile) {
    await hre.run("clean");
    await hre.run("compile");
    await hre.run("compile:one", { contractName });
  }

  console.log("Deploying ... ");
  console.log("");

  const contractFactory = await ethers.getContractFactory(contractName);
  let votingEscrow = await contractFactory
    .connect(safeSigner)
    .deploy(APY_ADDRESS, NAME, SYMBOL, VERSION);
  const receipt = await waitForSafeTxReceipt(
    votingEscrow.deployTransaction,
    safeSigner.service
  );
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    throw new Error("Contract address is missing.");
  }
  console.log("Contract address: %s", contractAddress);

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: contractAddress,
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
