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
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");
const { updateDeployJsons, bytes32 } = require("../utils/helpers.js");

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
  const APYAddressRegistry = await ethers.getContractFactory(
    "APYAddressRegistry"
  );
  const TransparentUpgradeableProxy = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );

  let deploy_data = {};

  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  deploy_data["APYAddressRegistryProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);

  const logic = await APYAddressRegistry.deploy();
  await logic.deployed();
  deploy_data["APYAddressRegistry"] = logic.address;
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
  deploy_data["APYAddressRegistryProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);

  await updateDeployJsons(NETWORK_NAME, deploy_data);

  /*
   * Register addresses for liquidity pools.
   *
   * Manager needs to be registered when it is deployed, as it also
   * will need a reference to the address registry.
   */
  console.log("");
  console.log("Registering addresses ...");
  console.log("");
  const DAI_POOL_ADDRESSES = require(DEPLOYS_JSON["DAI_APYPoolTokenProxy"]);
  const daiPoolAddress = DAI_POOL_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  console.log("DAI pool address:", daiPoolAddress);
  const USDC_POOL_ADDRESSES = require(DEPLOYS_JSON["USDC_APYPoolTokenProxy"]);
  const usdcPoolAddress = USDC_POOL_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  console.log("USDC pool address:", usdcPoolAddress);
  const USDT_POOL_ADDRESSES = require(DEPLOYS_JSON["USDT_APYPoolTokenProxy"]);
  const usdtPoolAddress = USDT_POOL_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  console.log("USDT pool address:", usdtPoolAddress);

  const registry = await APYAddressRegistry.attach(proxy.address);
  await registry.registerMultipleAddresses(
    [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
    [daiPoolAddress, usdcPoolAddress, usdtPoolAddress]
  );

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
