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
const { ethers, network } = require("hardhat");
const {
  getStrategyAccountInfo,
  getTvlManager,
  getAddressRegistry,
} = require("./utils");
const { bytes32 } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const tvlManager = await getTvlManager(networkName);

  // Aave interest-bearing DAI token
  const ADAI_ADDRESS = "0x028171bCA77440897B824Ca71D1c56caC55b68A3";

  const addressRegistry = await getAddressRegistry(networkName);
  const aavePeripheryAddress = await addressRegistry.getAddress(
    bytes32("aavePeriphery")
  );

  const [, accountAddress] = await getStrategyAccountInfo(networkName);

  console.log("");
  console.log("Register aave allocation for strategy account ...");
  console.log("");

  const AavePeriphery = await ethers.getContractFactory("AavePeriphery");
  const calldataForDai = AavePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address)",
    [accountAddress, ADAI_ADDRESS]
  );

  const data = [aavePeripheryAddress, calldataForDai];
  let trx = await tvlManager.addAssetAllocation(data, "DAI", 18);
  await trx.wait();
  const allocationId = await tvlManager.generateDataHash(data);
  console.log("Allocation ID:", allocationId);

  console.log("... done.");
  console.log("");

  /****************************************/
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Registration successful.");
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
