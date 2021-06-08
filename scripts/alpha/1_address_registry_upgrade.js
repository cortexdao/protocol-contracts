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
const {
  getGasPrice,
  updateDeployJsons,
  getDeployedAddress,
  bytes32,
} = require("../../utils/helpers");
const { BigNumber } = ethers;

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
  console.log("Deployer address:", addressRegistryDeployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: addressRegistryDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (
      await ethers.provider.getBalance(addressRegistryDeployer.address)
    ).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Upgrading ...");
  console.log("");

  const proxyAdminAddress = getDeployedAddress(
    "AddressRegistryProxyAdmin",
    networkName
  );
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    proxyAdminAddress,
    addressRegistryDeployer
  );
  const AddressRegistryV2 = await ethers.getContractFactory(
    "AddressRegistryV2",
    addressRegistryDeployer
  );
  const addressRegistryProxyAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const proxy = await ethers.getContractAt(
    "TransparentUpgradeableProxy",
    addressRegistryProxyAddress,
    addressRegistryDeployer
  );

  let deployData = {};
  let gasUsed = BigNumber.from("0");
  let gasPrice = await getGasPrice(argv.gasPrice);

  const addressRegistry = AddressRegistryV2.attach(proxy.address);

  // set old Manager as TvlManager temporarily to avoid
  // Chainlink service interruption
  const oldManagerAddress = await addressRegistry.getAddress(
    bytes32("chainlinkRegistry")
  );
  let trx = await addressRegistry.registerAddress(
    bytes32("tvlManager"),
    oldManagerAddress,
    {
      gasPrice,
    }
  );
  console.log(
    "Remap TVL manager address:",
    `https://etherscan.io/tx/${trx.hash}`
  );
  console.log("");
  let receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  // deploy V2 logic and upgrade
  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await AddressRegistryV2.deploy({ gasPrice });
  console.log(
    "Deploy V2 logic:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  receipt = await logic.deployTransaction.wait();
  deployData["AddressRegistryV2"] = logic.address;
  console.log(`V2 logic: ${chalk.green(logic.address)}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await proxyAdmin.upgrade(proxy.address, logic.address, {
    gasPrice,
  });
  console.log("Upgrade proxy:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  // delete deprecated identifiers
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await addressRegistry.deleteAddress(bytes32("manager"), { gasPrice });
  console.log(
    "Delete old manager address:",
    `https://etherscan.io/tx/${trx.hash}`
  );
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await addressRegistry.deleteAddress(bytes32("chainlinkRegistry"), {
    gasPrice,
  });
  console.log(
    "Delete chainlink registry address:",
    `https://etherscan.io/tx/${trx.hash}`
  );
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  const lpSafeAddress = getDeployedAddress("LpSafe", networkName);
  trx = await addressRegistry.registerAddress(
    bytes32("lpSafe"),
    lpSafeAddress,
    {
      gasPrice,
    }
  );
  console.log("Register LP Safe:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  updateDeployJsons(networkName, deployData);
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(logic.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: logic.address,
    });
    console.log("");
  }
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
