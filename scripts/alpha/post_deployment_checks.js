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
const { expect } = require("chai");
const chalk = require("chalk");
const {
  getDeployedAddress,
  bytes32,
  MAX_UINT256,
} = require("../../utils/helpers");

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
    addressRegistryAddress
  );
  const mAptAddress = getDeployedAddress("MetaPoolTokenProxy", networkName);
  const mApt = await ethers.getContractAt("MetaPoolToken", mAptAddress);
  const poolManagerAddress = getDeployedAddress(
    "PoolManagerProxy",
    networkName
  );
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress
  );
  const tvlManagerAddress = getDeployedAddress("TVLManager", networkName);
  const tvlManager = await ethers.getContractAt(
    "TVLManager",
    tvlManagerAddress
  );
  const oracleAdapterAddress = getDeployedAddress("OracleAdapter", networkName);
  const oracleAdapter = await ethers.getContractAt(
    "OracleAdapter",
    oracleAdapterAddress
  );

  const lpSafeAddress = getDeployedAddress("LpSafe", networkName);

  console.log("Check owners ...");
  expect(await addressRegistry.owner()).to.equal(
    addressRegistryDeployer.address
  );
  expect(await mApt.owner()).to.equal(mAptDeployer.address);
  expect(await poolManager.owner()).to.equal(poolManagerDeployer.address);
  expect(await tvlManager.owner()).to.equal(tvlManagerDeployer.address);
  // TODO
  expect(await oracleAdapter.owner()).to.equal(oracleAdapterDeployer.address);
  console.logDone();

  console.log("Check address registry addresses ...");
  try {
    await addressRegistry.getAddress(bytes32("chainlinkRegistry"));
    expect.to.fail();
  } catch (error) {
    expect(error.message).to.equal(
      "VM Exception while processing transaction: revert Missing address"
    );
  }
  try {
    await addressRegistry.getAddress(bytes32("manager"));
    expect.to.fail();
  } catch (error) {
    expect(error.message).to.equal(
      "VM Exception while processing transaction: revert Missing address"
    );
  }
  expect(await addressRegistry.mAptAddress()).to.equal(mApt.address);
  expect(await addressRegistry.lpSafeAddress()).to.equal(lpSafeAddress);
  expect(await addressRegistry.poolManagerAddress()).to.equal(
    poolManager.address
  );
  expect(await addressRegistry.tvlManagerAddress()).to.equal(
    tvlManager.address
  );
  expect(await addressRegistry.chainlinkRegistryAddress()).to.equal(
    tvlManager.address
  );
  // TODO
  expect(await addressRegistry.oracleAdapterAddress()).to.equal(
    oracleAdapter.address
  );
  console.logDone();

  console.log("Check address registry set on mAPT ...");
  expect(await mApt.addressRegistry()).to.equal(addressRegistry.address);
  console.logDone();

  // TODO
  console.log("Check oracle adapter set on mAPT ...");
  expect(await mApt.oracleAdapter()).to.equal(oracleAdapter.address);
  console.logDone();

  console.log("Check address registry set on pool manager ...");
  expect(await poolManager.addressRegistry()).to.equal(addressRegistry.address);
  console.logDone();

  console.log("Check pools upgrade ...");
  for (let poolId of ["daiPool", "usdcPool", "usdtPool"]) {
    console.log("- " + poolId);
    poolId = bytes32(poolId);
    const poolAddress = await addressRegistry.getAddress(poolId);
    const pool = await ethers.getContractAt("PoolTokenV2", poolAddress);

    // sanity-check; also checks if we are using V2 contracts
    expect(await pool.addressRegistry()).to.equal(addressRegistry.address);
    // TODO
    expect(await pool.oracleAdapter()).to.equal(oracleAdapter.address);

    // check pool manager allowances
    const underlyerAddress = await pool.underlyer();
    const underlyer = await ethers.getContractAt(
      "IDetailedERC20",
      underlyerAddress
    );
    const allowance = await underlyer.allowance(
      poolAddress,
      poolManager.address
    );
    expect(allowance).to.equal(MAX_UINT256);

    // check pool underlyer price is in USD
    expect(await pool.getUnderlyerPrice()).to.be.lt("110000000");
    expect(await pool.getUnderlyerPrice()).to.be.gt("90000000");
  }
  console.logDone();
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("All checks are successful.");
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
