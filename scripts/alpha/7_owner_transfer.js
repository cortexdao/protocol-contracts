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
const { ethers, network } = hre;
const chalk = require("chalk");
const {
  getDeployedAddress,
  bytes32,
  getGasPrice,
} = require("../../utils/helpers");

console.logDone = function () {
  console.log("");
  console.log.apply(this, [chalk.green("√") + " ... done."]);
  console.log("");
};

async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const poolDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const mAptDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const poolManagerDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const tvlManagerDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const oracleAdapterDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress,
    addressRegistryDeployer
  );
  const mAptAddress = getDeployedAddress("MetaPoolTokenProxy", networkName);
  const mApt = await ethers.getContractAt(
    "MetaPoolToken",
    mAptAddress,
    mAptDeployer
  );
  const poolManagerAddress = getDeployedAddress(
    "PoolManagerProxy",
    networkName
  );
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress,
    poolManagerDeployer
  );
  const tvlManagerAddress = getDeployedAddress("TvlManager", networkName);
  const tvlManager = await ethers.getContractAt(
    "TvlManager",
    tvlManagerAddress,
    tvlManagerDeployer
  );
  const oracleAdapterAddress = getDeployedAddress("OracleAdapter", networkName);
  const oracleAdapter = await ethers.getContractAt(
    "OracleAdapter",
    oracleAdapterAddress,
    oracleAdapterDeployer
  );

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);

  console.log("Transferring ownerships ...");
  console.log("");

  let gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistry.transferOwnership(adminSafeAddress, {
    gasPrice,
  });
  console.log("Address Registry:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  let receipt = await trx.wait();
  let gasUsed = receipt.gasUsed;

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await mApt.transferOwnership(adminSafeAddress, { gasPrice });
  console.log("mAPT:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await poolManager.transferOwnership(adminSafeAddress, { gasPrice });
  console.log("Pool Manager:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await tvlManager.transferOwnership(adminSafeAddress, { gasPrice });
  console.log("TVL Manager:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await oracleAdapter.transferOwnership(adminSafeAddress, { gasPrice });
  console.log("Oracle Adapter:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  for (const poolName of ["daiDemoPool", "usdcDemoPool", "usdtDemoPool"]) {
    const poolId = bytes32(poolName);
    const poolAddress = await addressRegistry.getAddress(poolId);
    const pool = await ethers.getContractAt(
      "PoolTokenV2",
      poolAddress,
      poolDeployer
    );
    gasPrice = await getGasPrice(argv.gasPrice);
    const trx = await pool.transferOwnership(adminSafeAddress, { gasPrice });
    console.log(`${poolName}:`, `https://etherscan.io/tx/${trx.hash}`);
    console.log("");
    receipt = await trx.wait();
    gasUsed = gasUsed.add(receipt.gasUsed);
  }
  console.logDone();

  console.log("Total gas used:", gasUsed.toString());
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("All ownership transfers succeeded.");
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
