#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const assert = require("assert");
const chalk = require("chalk");
const {
  getDeployedAddress,
  bytes32,
  impersonateAccount,
} = require("../../utils/helpers");

// const [funder] = await ethers.getSigners();
// const fundingTrx = await funder.sendTransaction({
//   to: registryDeployer.address,
//   value: ethers.utils.parseEther("1.0"),
// });
// await fundingTrx.wait();

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  assert.strictEqual(
    NETWORK_NAME,
    "LOCALHOST",
    "This script is for local forked mainnet testing only."
  );

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  console.log("");
  console.log("Deploying AssetAllocationRegistry ...");
  console.log("");

  const AssetAllocationRegistry = await ethers.getContractFactory(
    "AssetAllocationRegistry"
  );

  const managerAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  const registry = await AssetAllocationRegistry.deploy(managerAddress);
  await registry.deployed();
  console.log("AssetAllocationRegistry:", chalk.green(registry.address));
  console.log("");

  console.log("");
  console.log("Register address for chainlink registry ...");
  console.log("");
  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  console.log("Address registry:", addressRegistryAddress);
  const addressRegistry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress
  );
  const addressRegistryOwnerAddress = await addressRegistry.owner();
  const addressRegistryOwner = await impersonateAccount(
    addressRegistryOwnerAddress
  );
  const trx = await addressRegistry
    .connect(addressRegistryOwner)
    .registerAddress(bytes32("chainlinkRegistry"), registry.address);
  await trx.wait();
  assert.strictEqual(
    await addressRegistry.chainlinkRegistryAddress(),
    registry.address,
    "Chainlink registry address is not registered correctly."
  );
  console.log("... done.");
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Deployment successful.");
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
