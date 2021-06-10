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
const { getDeployedAddress, getGasPrice } = require("../../utils/helpers");

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
    process.env.POOL_MNEMONIC
  ).connect(ethers.provider);
  const mAptDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const poolManagerDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);

  const addressRegistryProxyAdminAddress = getDeployedAddress(
    "AddressRegistryProxyAdmin",
    networkName
  );
  const addressRegistryProxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    addressRegistryProxyAdminAddress,
    addressRegistryDeployer
  );
  const mAptProxyAdminAddress = getDeployedAddress(
    "MetaPoolTokenProxyAdmin",
    networkName
  );
  const mAptProxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    mAptProxyAdminAddress,
    mAptDeployer
  );
  const poolManagerProxyAdminAddress = getDeployedAddress(
    "PoolManagerProxyAdmin",
    networkName
  );
  const poolManagerProxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    poolManagerProxyAdminAddress,
    poolManagerDeployer
  );
  const poolTokenProxyAdminAddress = getDeployedAddress(
    "PoolTokenProxyAdmin",
    networkName
  );
  const poolTokenProxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    poolTokenProxyAdminAddress,
    poolDeployer
  );

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  console.log("Admin Safe:", adminSafeAddress);

  console.log("Transferring ownerships ...");
  console.log("");

  let gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistryProxyAdmin.transferOwnership(
    adminSafeAddress,
    {
      gasPrice,
    }
  );
  console.log("Address Registry Admin:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  let receipt = await trx.wait();
  let gasUsed = receipt.gasUsed;

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await mAptProxyAdmin.transferOwnership(adminSafeAddress, { gasPrice });
  console.log("mAPT Admin:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await poolManagerProxyAdmin.transferOwnership(adminSafeAddress, {
    gasPrice,
  });
  console.log("Pool Manager Admin:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await poolTokenProxyAdmin.transferOwnership(adminSafeAddress, {
    gasPrice,
  });
  console.log("Pool Token Admin:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

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
