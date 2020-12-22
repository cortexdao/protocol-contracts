/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const { assert } = require("chai");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");
const { bytes32 } = require("../utils/helpers.js");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
  console.log("");

  /*
   * Manager needs to be registered after it and the registry are
   * deployed, as it will need a reference to the address registry.
   */
  console.log("");
  console.log("Register addresses for manager and chainlink registry ...");
  console.log("");
  const MANAGER_ADDRESSES = require(DEPLOYS_JSON["APYManagerProxy"]);
  const managerAddress = MANAGER_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  console.log("Manager:", managerAddress);
  const REGISTRY_ADDRESSES = require(DEPLOYS_JSON["APYAddressRegistryProxy"]);
  const addressRegistryAddress = REGISTRY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  console.log("Address registry:", addressRegistryAddress);

  const registry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress
  );
  await registry.registerAddress(bytes32("manager"), managerAddress);
  assert.equal(
    await registry.managerAddress.call(),
    managerAddress,
    "Manager address is not registered correctly."
  );
  await registry.registerAddress(bytes32("chainlinkRegistry"), managerAddress);
  assert.equal(
    await registry.chainlinkRegistryAddress.call(),
    managerAddress,
    "Chainlink registry address is not registered correctly."
  );
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
