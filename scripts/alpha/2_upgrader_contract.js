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
  getDeployedAddress,
  getSafeSigner,
  waitForSafeTxDetails,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
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

  const PoolTokenV2Upgrader = await ethers.getContractFactory(
    "PoolTokenV2Upgrader",
    deployer
  );

  await hre.run("clean");
  await hre.run("compile");
  await hre.run("compile:one", { contractName: "PoolTokenV2Upgrader" });
  const poolTokenV2FactoryAddress =
    "0xBb460e8269908BfD399141723b67838fE91D9324";
  const upgrader = await PoolTokenV2Upgrader.connect(safeSigner).deploy(
    poolTokenV2FactoryAddress
  );
  await waitForSafeTxDetails(upgrader.deployTransaction, safeSigner.service, 5);
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
