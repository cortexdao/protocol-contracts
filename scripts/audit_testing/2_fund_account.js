#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.  Values are passed like so:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js --arg1=val1 --arg2=val2
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ MNEMONIC='' yarn fork:mainnet
 */
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = hre;
const chalk = require("chalk");
const {
  getDeployedAddress,
  bytes32,
  getStablecoinAddress,
  tokenAmountToBigNumber,
} = require("../../utils/helpers");

console.logAddress = function (contractName, contractAddress) {
  contractName = contractName + ":";
  contractAddress = chalk.green(contractAddress);
  console.log.apply(this, [contractName, contractAddress]);
};

console.logDone = function () {
  console.log("");
  console.log.apply(this, [chalk.green("√") + " ... done."]);
  console.log("");
};

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress
  );
  const poolManagerAddress = await addressRegistry.getAddress(
    bytes32("poolManager")
  );
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress
  );

  console.log("");
  console.log("Funding strategy account from pools ...");
  console.log("");

  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const tokenAddress = getStablecoinAddress(symbol, networkName);
    const token = await ethers.getContractAt("IDetailedERC20", tokenAddress);
    stablecoins[symbol] = token;
  }

  const daiAmount = tokenAmountToBigNumber("1000000", "18"); // 1MM DAI
  const usdcAmount = tokenAmountToBigNumber("5000000", "6"); // 5MM USDC

  const accountId = bytes32("alpha");
  await poolManager.fundAccount(accountId, [
    {
      poolId: bytes32("daiPool"),
      amount: daiAmount,
    },
    {
      poolId: bytes32("usdcPool"),
      amount: usdcAmount,
    },
  ]);
  console.log("... done.");
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Execution successful.");
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
