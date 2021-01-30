/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants");
const { updateDeployJsons, bytes32 } = require("../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
  console.log("");

  /* Deploy address registry with proxy and admin */
  console.log("");
  console.log("Deploying ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYManager = await ethers.getContractFactory("APYManager");
  const TransparentUpgradeableProxy = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );

  let deploy_data = {};

  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  deploy_data["APYManagerProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);

  const logic = await APYManager.deploy();
  await logic.deployed();
  deploy_data["APYManager"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);

  const CONSTRUCTOR_ARG_ADDRESSES = require(DEPLOYS_JSON[
    "ProxyConstructorArg"
  ]);
  const constructorArgAddress =
    CONSTRUCTOR_ARG_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  let constructorArgContract;
  if (!constructorArgAddress) {
    const ConstructorArg = await ethers.getContractFactory(
      "ProxyConstructorArg"
    );
    constructorArgContract = await ConstructorArg.deploy();
    await constructorArgContract.deployed();
    deploy_data["ProxyConstructorArg"] = constructorArgContract.address;
  } else {
    constructorArgContract = await ethers.getContractAt(
      "ProxyConstructorArg",
      constructorArgAddress
    );
  }
  const encodedArg = await constructorArgContract.getEncodedArg(
    proxyAdmin.address
  );
  console.log("Encoded constructor arg:", encodedArg);

  const proxy = await TransparentUpgradeableProxy.deploy(
    logic.address,
    proxyAdmin.address,
    encodedArg
  );
  await proxy.deployed();
  deploy_data["APYManagerProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);

  await updateDeployJsons(NETWORK_NAME, deploy_data);

  console.log("");
  console.log("Set address registry and pool IDs ...");
  console.log("");
  const ADDRESS_REGISTRY_ADDRESSES = require(DEPLOYS_JSON[
    "APYAddressRegistryProxy"
  ]);
  const addressRegistryAddress =
    ADDRESS_REGISTRY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  console.log("Address registry address:", addressRegistryAddress);

  const manager = await ethers.getContractAt("APYManager", proxy.address);
  await manager.setAddressRegistry(addressRegistryAddress);
  await manager.setPoolIds([
    bytes32("daiPool"),
    bytes32("usdcPool"),
    bytes32("usdtPool"),
  ]);

  console.log("");
  console.log("Set tokens ...");
  console.log("");

  const registry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress
  );

  const daiPoolAddress = await registry.daiPoolAddress();
  const daiPool = await ethers.getContractAt("APYPoolToken", daiPoolAddress);
  const daiAddress = await daiPool.underlyer();
  console.log("DAI address:", daiAddress);
  const usdcPoolAddress = await registry.usdcPoolAddress();
  const usdcPool = await ethers.getContractAt("APYPoolToken", usdcPoolAddress);
  const usdcAddress = await usdcPool.underlyer();
  console.log("USDC address:", usdcAddress);
  const usdtPoolAddress = await registry.usdtPoolAddress();
  const usdtPool = await ethers.getContractAt("APYPoolToken", usdtPoolAddress);
  const usdtAddress = await usdtPool.underlyer();
  console.log("USDT address:", usdtAddress);

  await manager.setTokenAddresses([daiAddress, usdcAddress, usdtAddress]);

  console.log("");
  console.log("Use the following for Etherscan verification:");
  console.log(
    `yarn hardhat --network <NETWORK NAME> verify ${proxy.address} ${logic.address} ${proxyAdmin.address} ${encodedArg}`
  );
  console.log("");
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
