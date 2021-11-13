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
const { argv } = require("yargs")
  .option("maxFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .option("maxPriorityFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .option("compile", {
    type: "boolean",
    default: true,
    description: "Compile contract using `compile:one`",
  });
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  getMaxFee,
  updateDeployJsons,
  bytes32,
  getDeployedAddress,
  getSafeSigner,
  waitForSafeTxDetails,
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

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const owner = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", owner.address);
  console.log("");

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const safeSigner = await getSafeSigner(adminSafeAddress, owner, networkName);

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const AlphaDeployment = await ethers.getContractFactory(
    "AlphaDeployment",
    deployer
  );

  const deploy_data = {};
  const maxFeePerGas = await getMaxFee(argv.maxFeePerGas);
  const maxPriorityFeePerGas = parseInt(2e9);

  const addressesFilename = "scripts/alpha/deployment-factory-addresses.json";
  const factoryAddresses = JSON.parse(
    fs.readFileSync(addressesFilename, "utf-8")
  );

  const addressRegistryAddress = await getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
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

  await hre.run("clean");
  await hre.run("compile");
  await hre.run("compile:one", { contractName: "AlphaDeployment" });
  const alphaDeployment = await AlphaDeployment.connect(safeSigner).deploy(
    ...factoryAddresses,
    {
      maxFeePerGas,
      maxPriorityFeePerGas,
    }
  );
  await waitForSafeTxDetails(
    alphaDeployment.deployTransaction,
    safeSigner.service,
    5
  );

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
