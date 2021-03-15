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
const {
  getGasPrice,
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
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  // const [funder] = await ethers.getSigners();
  // const fundingTrx = await funder.sendTransaction({
  //   to: mAptDeployer.address,
  //   value: ethers.utils.parseEther("1.0"),
  // });
  // await fundingTrx.wait();

  const balance =
    (await ethers.provider.getBalance(registryDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  const registryAddress = getDeployedAddress(
    "APYAssetAllocationRegistry",
    NETWORK_NAME
  );
  const registry = await ethers.getContractAt(
    "APYAssetAllocationRegistry",
    registryAddress,
    registryDeployer
  );

  console.log("");
  console.log("Clear out deprecated allocations from testing ...");
  console.log("");

  let gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await registry.removeAssetAllocation(bytes32("daiPool"), {
    gasPrice,
  });
  console.log("Remove allocation:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await registry.removeAssetAllocation(bytes32("usdcPool"), { gasPrice });
  console.log("Remove allocation:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await registry.removeAssetAllocation(bytes32("usdtPool"), { gasPrice });
  console.log("Remove allocation:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  console.log(
    "Asset allocations (should be []):",
    await registry.getAssetAllocationIds()
  );
  console.log("... done.");

  console.log("");
  console.log("Registering ...");
  console.log("");
  // gasPrice = await getGasPrice(argv.gasPrice);
  // let trx = ...
  // console.log(
  //   "Deploy:",
  //   `https://etherscan.io/tx/${trx.hash}`
  // );
  // await trx.wait()
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
