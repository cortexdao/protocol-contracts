#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  getGasPrice,
  updateDeployJsons,
  bytes32,
  getDeployedAddress,
} = require("../../utils/helpers");
const fs = require("fs");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const AlphaDeployment = await ethers.getContractFactory(
    "AlphaDeployment",
    deployer
  );

  const deploy_data = {};
  const gasPrice = await getGasPrice(argv.gasPrice);

  const addressesFilename = "scripts/alpha/deployment-factory-addresses.json";
  const factoryAddresses = JSON.parse(
    fs.readFileSync(addressesFilename, "utf-8")
  );

  const addressRegistryAddress = await getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress
  );
  console.log(
    "LP Safe: %s",
    await addressRegistry.getAddress(bytes32("lpSafe"))
  );
  console.log(
    "Admin Safe: %s",
    await addressRegistry.getAddress(bytes32("adminSafe"))
  );
  console.log(
    "Emergency Safe: %s",
    await addressRegistry.getAddress(bytes32("emergencySafe"))
  );
  console.log("");

  const alphaDeployment = await AlphaDeployment.deploy(...factoryAddresses, {
    gasPrice,
  });
  console.log(
    `https://etherscan.io/tx/${alphaDeployment.deployTransaction.hash}`
  );
  const receipt = await alphaDeployment.deployTransaction.wait();

  console.log("");
  console.log("Gas used: %s", receipt.gasUsed.toString());
  console.log("");

  deploy_data["AlphaDeployment"] = alphaDeployment.address;
  updateDeployJsons(networkName, deploy_data);

  if (["KOVAN", "MAINNET"].includes(networkName)) {
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
  }
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
