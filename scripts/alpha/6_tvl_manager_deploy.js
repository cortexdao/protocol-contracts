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
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  getGasPrice,
  updateDeployJsons,
  getDeployedAddress,
  bytes32,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const tvlManagerDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", tvlManagerDeployer.address);
  /* TESTING on localhost only
   * may need to fund if ETH runs out while testing
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: tvlManagerDeployer.address,
      value: ethers.utils.parseEther("10.0"),
    });
    await fundingTrx.wait();
  }

  let balance =
    (await ethers.provider.getBalance(tvlManagerDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying TvlManager ...");
  console.log("");

  let gasUsed = BigNumber.from("0");

  const TvlManager = await ethers.getContractFactory(
    "TvlManager",
    tvlManagerDeployer
  );

  let gasPrice = await getGasPrice(argv.gasPrice);
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const tvlManager = await TvlManager.deploy(addressRegistryAddress, {
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${tvlManager.deployTransaction.hash}`
  );
  console.log("TvlManager:", chalk.green(tvlManager.address));
  console.log("  Address registry:", addressRegistryAddress);
  console.log("");
  let receipt = await tvlManager.deployTransaction.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  const deploy_data = {
    TvlManager: tvlManager.address,
  };
  updateDeployJsons(networkName, deploy_data);

  console.log("");
  console.log("Register address for chainlink registry ...");
  console.log("");
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress,
    addressRegistryDeployer
  );

  gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistry.registerAddress(
    bytes32("tvlManager"),
    tvlManager.address,
    { gasPrice }
  );
  console.log("Register address:", `https://etherscan.io/tx/${trx.hash}`);
  receipt = await trx.wait();
  console.log("");
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      tvlManager.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: tvlManager.address,
      constructorArguments: [addressRegistryAddress],
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
