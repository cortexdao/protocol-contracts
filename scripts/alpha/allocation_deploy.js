#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs")
  .option("name", {
    type: "string",
    description: "Allocation contract name",
  })
  .option("maxFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .option("maxPriorityFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .demandOption(["name"]);
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  getDeployedAddress,
  getSafeSigner,
  waitForSafeTxDetails,
  getMaxFee,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const allocationContractName = argv.name;
  console.log("Allocation contract name: %s", allocationContractName);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const owner = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", owner.address);
  console.log("");

  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");
  balance = (await ethers.provider.getBalance(owner.address)).toString() / 1e18;
  console.log("ETH balance (Safe owner): %s", balance);
  console.log("");

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const safeSigner = await getSafeSigner(adminSafeAddress, owner);

  await hre.run("clean");
  await hre.run("compile");
  await hre.run("compile:one", { contractName: allocationContractName });

  let maxFeePerGas = await getMaxFee(argv.maxFeePerGas);

  console.log("Deploying allocation ... ");
  console.log("");

  const allocationContractFactory = await ethers.getContractFactory(
    allocationContractName
  );
  const allocation = await allocationContractFactory
    .connect(safeSigner)
    .deploy({ maxFeePerGas });
  await waitForSafeTxDetails(allocation.deployTransaction, safeSigner.service);

  const allocationName = await allocation.NAME();
  console.log("Registering %s", allocationName);
  console.log("");

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );
  const tvlManagerAddress = await addressRegistry.tvlManagerAddress();
  const tvlManager = await ethers.getContractAt(
    "TvlManager",
    tvlManagerAddress
  );
  maxFeePerGas = await getMaxFee(argv.maxFeePerGas);
  const allocationAddress = allocation.address;
  const proposedTx = await tvlManager
    .connect(safeSigner)
    .registerAssetAllocation(allocationAddress, { maxFeePerGas });
  await waitForSafeTxDetails(proposedTx, safeSigner.service, 5);

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: allocationAddress,
  });
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Allocation registered.");
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
