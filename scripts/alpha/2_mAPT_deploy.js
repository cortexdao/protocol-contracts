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
  bytes32,
  getGasPrice,
  updateDeployJsons,
  getAggregatorAddress,
  getDeployedAddress,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const MAPT_MNEMONIC = process.env.MAPT_MNEMONIC;
  const mAptDeployer = ethers.Wallet.fromMnemonic(MAPT_MNEMONIC).connect(
    ethers.provider
  );
  console.log("Deployer address:", mAptDeployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: mAptDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(mAptDeployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory(
    "ProxyAdmin",
    mAptDeployer
  );
  const MetaPoolToken = await ethers.getContractFactory(
    "MetaPoolToken",
    mAptDeployer
  );
  const MetaPoolTokenProxy = await ethers.getContractFactory(
    "MetaPoolTokenProxy",
    mAptDeployer
  );

  let deploy_data = {};
  let gasUsed = BigNumber.from("0");

  let gasPrice = await getGasPrice(argv.gasPrice);
  const proxyAdmin = await ProxyAdmin.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxyAdmin.deployTransaction.hash}`
  );
  let receipt = await proxyAdmin.deployTransaction.wait();
  deploy_data["MetaPoolTokenProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${chalk.green(proxyAdmin.address)}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await MetaPoolToken.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  receipt = await logic.deployTransaction.wait();
  deploy_data["MetaPoolToken"] = logic.address;
  console.log(`Implementation Logic: ${chalk.green(logic.address)}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistryProxyAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryProxyAddress,
    addressRegistryDeployer
  );

  const tvlAggAddress = getAggregatorAddress("TVL", networkName);
  const aggStalePeriod = 14400;
  gasPrice = await getGasPrice(argv.gasPrice);
  const proxy = await MetaPoolTokenProxy.deploy(
    logic.address,
    proxyAdmin.address,
    tvlAggAddress,
    addressRegistry.address,
    aggStalePeriod,
    { gasPrice }
  );
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
  );
  receipt = await proxy.deployTransaction.wait();
  deploy_data["MetaPoolTokenProxy"] = proxy.address;
  console.log(`Proxy: ${chalk.green(proxy.address)}`);
  console.log("TVL Aggregator:", tvlAggAddress);
  console.log("Address Registry:", addressRegistry.address);
  console.log("Aggregator stale period:", aggStalePeriod);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistry.registerAddress(
    bytes32("mApt"),
    proxy.address,
    {
      gasPrice,
    }
  );
  console.log("Register address:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  updateDeployJsons(networkName, deploy_data);
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(proxy.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: proxy.address,
      constructorArguments: [
        logic.address,
        proxyAdmin.address,
        tvlAggAddress,
        aggStalePeriod.toString(),
      ],
      // to avoid the "More than one contract was found to match the deployed bytecode."
      // with proxy contracts that only differ in constructors but have the same bytecode
      contract: "contracts/MetaPoolTokenProxy.sol:MetaPoolTokenProxy",
    });
    await hre.run("verify:verify", {
      address: logic.address,
    });
    await hre.run("verify:verify", {
      address: proxyAdmin.address,
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
