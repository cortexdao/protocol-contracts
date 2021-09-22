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
require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { getGasPrice, getDeployedAddress } = require("../../utils/helpers");
const { expect } = require("chai");

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

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: deployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  const gasPrice = await getGasPrice(argv.gasPrice);

  const alphaDeploymentAddress = getDeployedAddress(
    "AlphaDeployment",
    networkName
  );

  const alphaDeployment = await ethers.getContractAt(
    "AlphaDeployment",
    alphaDeploymentAddress
  );

  // transfer ownerships
  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );
  let tx = await alphaDeployment.handoffOwnership(addressRegistryAddress, {
    gasPrice,
  });
  await tx.wait();
  tx = await addressRegistry.transferOwnership(adminSafeAddress, { gasPrice });
  await tx.wait();

  expect(await addressRegistry.owner()).to.equal(adminSafeAddress);

  const addressRegistryProxyAdminAddress = getDeployedAddress(
    "AddressRegistryProxyAdmin",
    networkName
  );
  const addressRegistryProxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    addressRegistryProxyAdminAddress
  );
  tx = await alphaDeployment.handoffOwnership(
    addressRegistryProxyAdminAddress,
    { gasPrice }
  );
  await tx.wait();

  tx = await addressRegistryProxyAdmin.transferOwnership(
    addressRegistryDeployer.address,
    { gasPrice }
  );
  await tx.wait();

  expect(await addressRegistryProxyAdmin.owner()).to.equal(
    addressRegistryDeployer.address
  );
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
