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
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  getGasPrice,
  updateDeployJsons,
  getDeployedAddress,
} = require("../../utils/helpers");
const fs = require("fs");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  if (!["KOVAN", "MAINNET"].includes(networkName)) return;

  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const alphaDeployment = await getDeployedAddress(
    "AlphaDeployment",
    networkName
  );
  const addressesFilename = "deployment-factory-addresses.json";
  const factoryAddresses = JSON.parse(
    fs.readFileSync(addressesFilename, "utf-8")
  );
  console.log("");
  console.log("Verifying on Etherscan ...");
  await ethers.provider.waitForTransaction(
    alphaDeployment.deployTransaction.hash,
    5
  ); // wait for Etherscan to catch up
  await hre.run("verify:verify", {
    address: alphaDeployment.address,
    constructorArguments: factoryAddresses,
  });
  console.log("");

  const addressRegistryV2Address = await alphaDeployment.addressRegistryV2();
  await hre.run("verify:verify", {
    address: addressRegistryV2Address,
  });

  const mAptAddress = await alphaDeployment.mApt();
  let [proxyAdminAddress, logicAddress] = await getEip1967Slots(mAptAddress);
  await hre.run("verify:verify", {
    address: mAptAddress,
    constructorArguments: [logicAddress, proxyAdminAddress, initData],
  });

  const tvlManagerAddress = await alphaDeployment.tvlManager();
  await hre.run("verify:verify", {
    address: tvlManagerAddress,
  });
}

async function getEip1967Slots(proxyAddress) {
  // get logic address from slot specified by EIP-1967
  let logicAddress = await ethers.provider.getStorageAt(
    proxyAddress,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  logicAddress = ethers.utils.getAddress(logicAddress.slice(-40));
  // get admin address from slot specified by EIP-1967
  let proxyAdminAddress = await ethers.provider.getStorageAt(
    proxyAddress,
    "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
  );
  proxyAdminAddress = ethers.utils.getAddress(proxyAdminAddress.slice(-40));

  return [logicAddress, proxyAdminAddress];
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
