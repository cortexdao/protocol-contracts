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
  .option("gasPrice", {
    type: "number",
    description: "Gas price in gwei; omitting uses GasNow value",
  })
  .demandOption(["name"]);
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { getGasPrice, getDeployedAddress } = require("../../utils/helpers");
const {
  SafeService,
  SafeEthersSigner,
} = require("@gnosis.pm/safe-ethers-adapters");

const MAINNET_SERVICE_URL = "https://safe-transaction.gnosis.io/";

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
  const signer = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", signer.address);
  console.log("");

  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");
  balance =
    (await ethers.provider.getBalance(signer.address)).toString() / 1e18;
  console.log("ETH balance (Safe signer): %s", balance);
  console.log("");

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const service = new SafeService(MAINNET_SERVICE_URL);
  const safeSigner = await SafeEthersSigner.create(
    adminSafeAddress,
    signer,
    service
  );

  console.log("Deploying allocation ... ");
  console.log("");

  const allocationContractFactory = await ethers.getContractFactory(
    allocationContractName
  );
  let gasPrice = await getGasPrice(argv.gasPrice);
  const allocation = await allocationContractFactory.deploy({ gasPrice });
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
  gasPrice = await getGasPrice(argv.gasPrice);
  const proposedTx = await tvlManager
    .connect(safeSigner)
    .registerAssetAllocation(allocation, { gasPrice });
  console.log("USER ACTION REQUIRED");
  console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  await proposedTx.wait();
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
