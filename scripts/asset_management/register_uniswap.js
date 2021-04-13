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

  // USDC-USDT pair
  const LP_TOKEN_ADDRESS = "0x3041cbd36888becc7bbcbc0045e3b1f144466f5f";

  const [, accountAddress] = await getStrategyAccountInfo(networkName);

  const addressRegistry = await getAddressRegistry(networkName);
  const uniswapPeripheryAddress = await addressRegistry.getAddress(
    bytes32("uniswapPeriphery")
  );

  console.log("");
  console.log("Register Uniswap allocations for strategy account ...");
  console.log("");

  const UniswapPeriphery = await ethers.getContractFactory("UniswapPeriphery");

  const calldataForUsdc = UniswapPeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,uint256)",
    [accountAddress, LP_TOKEN_ADDRESS, 0]
  );
  const calldataForUsdt = UniswapPeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,uint256)",
    [accountAddress, LP_TOKEN_ADDRESS, 1]
  );

  let data = [uniswapPeripheryAddress, calldataForUsdc];
  let trx = await tvlManager.addAssetAllocation(data, "USDC", 6);
  await trx.wait();
  let allocationId = await tvlManager.generateDataHash(data);
  console.log("USDC Allocation ID:", allocationId);

  data = [uniswapPeripheryAddress, calldataForUsdt];
  trx = await tvlManager.addAssetAllocation(data, "USDT", 6);
  await trx.wait();
  allocationId = await tvlManager.generateDataHash(data);
  console.log("USDT Allocation ID:", allocationId);

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
