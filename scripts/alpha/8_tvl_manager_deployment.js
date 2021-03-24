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
const assert = require("assert");
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

  const TVL_MANAGER_MNEMONIC = process.env.TVL_MANAGER_MNEMONIC;
  const tvlManagerDeployer = ethers.Wallet.fromMnemonic(
    TVL_MANAGER_MNEMONIC
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
  console.log("Deploying TVLManager ...");
  console.log("");

  const TVLManager = await ethers.getContractFactory(
    "TVLManager",
    tvlManagerDeployer
  );

  let gasPrice = await getGasPrice(argv.gasPrice);
  const poolManagerAddress = getDeployedAddress(
    "PoolManagerProxy",
    networkName
  );
  const accountManagerAddress = getDeployedAddress(
    "AccountManagerProxy",
    networkName
  );
  const tvlManager = await TVLManager.deploy(
    poolManagerAddress,
    accountManagerAddress,
    {
      gasPrice,
    }
  );
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${tvlManager.deployTransaction.hash}`
  );
  await tvlManager.deployed();
  console.log("TVLManager:", chalk.green(tvlManager.address));
  console.log("");
  // assert.strictEqual(await tvlManager.owner(), tvlManagerDeployer.address);

  const deploy_data = {
    TVLManager: tvlManager.address,
  };
  updateDeployJsons(networkName, deploy_data);

  console.log("");
  console.log("Register address for chainlink registry ...");
  console.log("");
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  console.log("Address registry:", addressRegistryAddress);
  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress,
    addressRegistryDeployer
  );
  console.log(
    "Address Registry Deployer address:",
    addressRegistryDeployer.address
  );
  balance =
    (
      await ethers.provider.getBalance(addressRegistryDeployer.address)
    ).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistry.registerAddress(
    bytes32("tvlManager"),
    tvlManager.address,
    { gasPrice }
  );
  console.log("Register address:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  assert.strictEqual(
    await addressRegistry.chainlinkRegistryAddress(),
    tvlManager.address,
    "Chainlink registry address is not registered correctly."
  );
  console.log("... done.");

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      tvlManager.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: tvlManager.address,
      constructorArguments: [poolManagerAddress, accountManagerAddress],
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
