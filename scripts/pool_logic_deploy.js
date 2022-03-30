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

const PROXY_ADMIN_ADDRESS = "0x7965283631253DfCb71Db63a60C656DEDF76234f";
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const FAKE_AGG_ADDRESS = "0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe";

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

  const contractName = "PoolTokenV3";
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
  const logicV3 = await contractFactory
    .connect(safeOwner)
    .deploy({ maxFeePerGas, maxPriorityFeePerGas });
  await logicV3.deployTransaction.wait(5);

  console.log("Contract address: %s", logicV3.address);

  await logicV3
    .connect(safeOwner)
    .initialize(PROXY_ADMIN_ADDRESS, DAI_ADDRESS, FAKE_AGG_ADDRESS, {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: logicV3.address,
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
