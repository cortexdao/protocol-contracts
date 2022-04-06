#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs")
  .option("compile", {
    type: "boolean",
    default: true,
    description: "Compile contract using `compile:one`",
  })
  .option("maxFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .option("maxPriorityFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  });
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { getMaxFee, getMaxPriorityFee } = require("../utils/helpers");

const ADDRESS_REGISTRY_ADDRESS = "0x7ec81b7035e91f8435bdeb2787dcbd51116ad303";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const safeOwner = new ethers.Wallet(
    process.env.SAFE_OWNER_KEY,
    ethers.provider
  );
  console.log("Deployer: %s", safeOwner.address);
  const balance =
    (await ethers.provider.getBalance(safeOwner.address)).toString() / 1e18;
  console.log("ETH balance (Safe owner): %s", balance);

  const contractName = "MetaPoolTokenV2";
  console.log(`${contractName} deploy`);
  console.log("");

  if (argv.compile) {
    await hre.run("clean");
    await hre.run("compile");
    await hre.run("compile:one", { contractName });
  }

  const maxFeePerGas = await getMaxFee(argv.maxFeePerGas);
  const maxPriorityFeePerGas = await getMaxPriorityFee(
    argv.maxPriorityFeePerGas
  );

  console.log("Deploying ... ");
  console.log("");

  const contractFactory = await ethers.getContractFactory(contractName);
  const logicV2 = await contractFactory
    .connect(safeOwner)
    .deploy({ maxFeePerGas, maxPriorityFeePerGas });
  await logicV2.deployTransaction.wait(5);

  console.log("Contract address: %s", logicV2.address);

  await logicV2.connect(safeOwner).initialize(ADDRESS_REGISTRY_ADDRESS, {
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: logicV2.address,
  });
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Contract deployed.");
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
