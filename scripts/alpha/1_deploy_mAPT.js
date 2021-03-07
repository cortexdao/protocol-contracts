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
const {
  getGasPrice,
  updateDeployJsons,
  getAggregatorAddress,
  getDeployedAddress,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYMetaPoolToken = await ethers.getContractFactory("APYMetaPoolToken");
  const APYMetaPoolTokenProxy = await ethers.getContractFactory(
    "APYMetaPoolTokenProxy"
  );

  let deploy_data = {};

  let gasPrice = await getGasPrice(argv.gasPrice);
  const proxyAdmin = await ProxyAdmin.deploy({ gasPrice });
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${proxyAdmin.deployTransaction.hash}`
  );
  await proxyAdmin.deployed();
  deploy_data["APYMetaPoolTokenProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await APYMetaPoolToken.deploy({ gasPrice });
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  await logic.deployed();
  deploy_data["APYMetaPoolToken"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);
  console.log("");

  const tvlAggAddress = getAggregatorAddress("TVL", NETWORK_NAME);
  const ethUsdAggAddress = getAggregatorAddress("ETH-USD", NETWORK_NAME);
  const aggStalePeriod = 14400;
  gasPrice = await getGasPrice(argv.gasPrice);
  const proxy = await APYMetaPoolTokenProxy.deploy(
    logic.address,
    proxyAdmin.address,
    tvlAggAddress,
    ethUsdAggAddress,
    aggStalePeriod,
    { gasPrice }
  );
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
  );
  await proxy.deployed();
  deploy_data["APYMetaPoolTokenProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);
  console.log("");

  console.log("");
  console.log("ETH-USD Aggregator:", ethUsdAggAddress);
  console.log("TVL Aggregator:", tvlAggAddress);
  console.log("");
  console.log("Aggregator stale period:", aggStalePeriod);
  console.log("");

  updateDeployJsons(NETWORK_NAME, deploy_data);

  const managerAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  console.log("Manager:", managerAddress);
  const mAPT = await APYMetaPoolToken.attach(proxy.address);
  const trx = await mAPT.setManagerAddress(managerAddress);
  console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  console.log("Set manager address on mAPT.");
  console.log("");

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(proxy.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: proxy.address,
      constructorArguments: [
        logic.address,
        proxyAdmin.address,
        tvlAggAddress,
        ethUsdAggAddress,
        aggStalePeriod.toString(),
      ],
      // to avoid the "More than one contract was found to match the deployed bytecode."
      // with proxy contracts that only differ in constructors but have the same bytecode
      contract: "contracts/APYMetaPoolTokenProxy.sol:APYMetaPoolTokenProxy",
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
