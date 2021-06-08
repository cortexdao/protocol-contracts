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
const chalk = require("chalk");
const { getDeployedAddress, bytes32 } = require("../../utils/helpers");

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

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const POOL_MNEMONIC = process.env.POOL_MNEMONIC;
  const poolDeployer = ethers.Wallet.fromMnemonic(POOL_MNEMONIC).connect(
    ethers.provider
  );
  const MAPT_MNEMONIC = process.env.MAPT_MNEMONIC;
  const mAptDeployer = ethers.Wallet.fromMnemonic(MAPT_MNEMONIC).connect(
    ethers.provider
  );
  const POOL_MANAGER_MNEMONIC = process.env.POOL_MANAGER_MNEMONIC;
  const poolManagerDeployer = ethers.Wallet.fromMnemonic(
    POOL_MANAGER_MNEMONIC
  ).connect(ethers.provider);
  const TVL_MANAGER_MNEMONIC = process.env.TVL_MANAGER_MNEMONIC;
  const tvlManagerDeployer = ethers.Wallet.fromMnemonic(
    TVL_MANAGER_MNEMONIC
  ).connect(ethers.provider);
  // TODO
  const ORACLE_ADAPTER_MNEMONIC = process.env.ORACLE_ADAPTER_MNEMONIC;
  const oracleAdapterDeployer = ethers.Wallet.fromMnemonic(
    ORACLE_ADAPTER_MNEMONIC
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
  const tvlManagerAddress = getDeployedAddress("TVLManager", networkName);
  const tvlManager = await ethers.getContractAt(
    "TVLManager",
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

  await addressRegistry.transferOwnership(adminSafeAddress);
  await mApt.transferOwnership(adminSafeAddress);
  await poolManager.transferOwnership(adminSafeAddress);
  await tvlManager.transferOwnership(adminSafeAddress);
  await oracleAdapter.transferOwnership(adminSafeAddress);

  for (let poolId of ["daiDemoPool", "usdcDemoPool", "usdtDemoPool"]) {
    console.log("- " + poolId);
    poolId = bytes32(poolId);
    const poolAddress = await addressRegistry.getAddress(poolId);
    const pool = await ethers.getContractAt(
      "PoolTokenV2",
      poolAddress,
      poolDeployer
    );
    await pool.transferOwnership(adminSafeAddress);
  }
  console.logDone();
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
