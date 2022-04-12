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
} = require("../../utils/helpers");

const APY_GOV_TOKEN_ADDRESS = "0xA41d3d461B8a9f1E9F92d2B040495cE21CfED548";
// use old ganache default account 0
const SIGNER_ADDRESS = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

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

  const contractName = "RewardDistributor";
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
  const contract = await contractFactory
    .connect(safeSigner)
    .deploy(APY_GOV_TOKEN_ADDRESS, SIGNER_ADDRESS);
  const receipt = await waitForSafeTxReceipt(
    contract.deployTransaction,
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
    constructorArguments: [APY_GOV_TOKEN_ADDRESS, SIGNER_ADDRESS],
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
