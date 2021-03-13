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
  getGasPrice,
  updateDeployJsons,
  getDeployedAddress,
  bytes32,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const ALLOCATION_REGISTRY_MNEMONIC = process.env.ALLOCATION_REGISTRY_MNEMONIC;
  const registryDeployer = ethers.Wallet.fromMnemonic(
    ALLOCATION_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", registryDeployer.address);
  /* TESTING on localhost only
   * may need to fund if ETH runs out while testing
   */
  // const [funder] = await ethers.getSigners();
  // const fundingTrx = await funder.sendTransaction({
  //   to: registryDeployer.address,
  //   value: ethers.utils.parseEther("1.0"),
  // });
  // await fundingTrx.wait();

  const balance =
    (await ethers.provider.getBalance(registryDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying APYAssetAllocationRegistry ...");
  console.log("");

  const APYAssetAllocationRegistry = await ethers.getContractFactory(
    "APYAssetAllocationRegistry",
    registryDeployer
  );

  const managerAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  let gasPrice = await getGasPrice(argv.gasPrice);
  const registry = await APYAssetAllocationRegistry.deploy(managerAddress, {
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${registry.deployTransaction.hash}`
  );
  await registry.deployed();
  console.log("APYAssetAllocationRegistry:", chalk.green(registry.address));
  console.log("");
  assert.strictEqual(await registry.owner(), registryDeployer.address);

  const deploy_data = {
    APYAssetAllocationRegistry: registry.address,
  };
  updateDeployJsons(NETWORK_NAME, deploy_data);

  console.log("");
  console.log("Register address for chainlink registry ...");
  console.log("");
  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  console.log("Address registry:", addressRegistryAddress);
  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress,
    addressRegistryDeployer
  );
  const trx = await addressRegistry.registerAddress(
    bytes32("chainlinkRegistry"),
    registry.address
  );
  console.log("Deploy:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  assert.strictEqual(
    await addressRegistry.chainlinkRegistryAddress(),
    registry.address,
    "Chainlink registry address is not registered correctly."
  );
  console.log("... done.");

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      registry.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: registry.address,
      constructorArguments: [managerAddress],
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
