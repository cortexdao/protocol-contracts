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
const { ethers, network } = require("hardhat");
const {
  waitForSafeTxReceipt,
  getAdminSafeSigner,
} = require("../utils/helpers");

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

  const contractName = "MetaPoolTokenV2";
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
  let apy = await contractFactory.connect(safeSigner).deploy();
  const receipt = await waitForSafeTxReceipt(
    apy.deployTransaction,
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
