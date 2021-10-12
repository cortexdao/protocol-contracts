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
    description: "Swap contract name",
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
const { getMaxFee, getDeployedAddress } = require("../../utils/helpers");
const {
  waitForSafeTxDetails,
  getSafeSigner,
} = require("../../utils/helpers/safe");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const swapContractName = argv.name;
  console.log("Swap contract name: %s", swapContractName);
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
  await hre.run("compile:one", { contractName: swapContractName });

  let maxFeePerGas = await getMaxFee(argv.maxFeePerGas);

  console.log("Deploying swap ... ");
  console.log("");

  const swapContractFactory = await ethers.getContractFactory(swapContractName);
  const swap = await swapContractFactory
    .connect(safeSigner)
    .deploy({ maxFeePerGas });
  await waitForSafeTxDetails(swap.deployTransaction, safeSigner.service);

  const swapName = await swap.NAME();
  console.log("Registering %s", swapName);
  console.log("");

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );
  const lpAccountAddress = await addressRegistry.lpAccountAddress();
  const lpAccount = await ethers.getContractAt("LpAccount", lpAccountAddress);
  maxFeePerGas = await getMaxFee(argv.maxFeePerGas);
  const swapAddress = swap.address;
  const proposedTx = await lpAccount
    .connect(safeSigner)
    .registerSwap(swapAddress, { maxFeePerGas });
  await waitForSafeTxDetails(proposedTx, safeSigner.service, 5);

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: swapAddress,
  });
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Swap registered.");
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
