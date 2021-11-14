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
    description: "Zap contract name",
  })
  .option("compile", {
    type: "boolean",
    default: true,
    description: "Compile contract using `compile:one`",
  })
  .demandOption(["name"]);
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  getDeployedAddress,
  waitForSafeTxDetails,
  getSafeSigner,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const zapContractName = argv.name;
  console.log("Zap contract name: %s", zapContractName);
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

  if (argv.compile) {
    await hre.run("clean");
    await hre.run("compile");
    await hre.run("compile:one", { contractName: zapContractName });
  }

  console.log("Deploying zap ... ");
  console.log("");

  const zapContractFactory = await ethers.getContractFactory(zapContractName);
  const zap = await zapContractFactory.connect(safeSigner).deploy();
  console.log("Zap address:", zap.address);
  console.log("");
  const receipt = await waitForSafeTxDetails(
    zap.deployTransaction,
    safeSigner.service
  );
  const zapAddress = receipt.contractAddress;
  if (!zapAddress) {
    throw new Error("Zap address is missing.");
  }
  console.log("Zap address: %s", zapAddress);

  const zapName = await zap.NAME();
  console.log("Registering %s", zapName);
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
  const proposedTx = await lpAccount
    .connect(safeSigner)
    .registerZap(zapAddress);
  await waitForSafeTxDetails(proposedTx, safeSigner.service);

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: zapAddress,
  });
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Zap registered.");
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
