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
const { updateDeployJsons } = require("../utils/helpers.js");

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

  /* Deploy address registry with proxy and admin */
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYAddressRegistry = await ethers.getContractFactory(
    "APYAddressRegistry"
  );
  const APYAddressRegistryProxy = await ethers.getContractFactory(
    "APYAddressRegistryProxy"
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

  const proxy = await APYAddressRegistryProxy.deploy(
    logic.address,
    proxyAdmin.address
  );
  await proxy.deployed();
  deploy_data["APYAddressRegistryProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);

  await updateDeployJsons(NETWORK_NAME, deploy_data);

  /* Register addresses for manager and pools */
  console.log("");
  console.log("Registering addresses...");
  // const MANAGER_ADDRESSES = DEPLOYS_JSON["APYManagerProxy"];
  // const managerAddress = MANAGER_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];
  // console.log("Manager address:", managerAddress);
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
    // ["manager", "chainlinkRegistry", "daiPool", "usdcPool", "usdtPool"],
    ["daiPool", "usdcPool", "usdtPool"],
    [
      // managerAddress,
      // managerAddress,
      daiPoolAddress,
      usdcPoolAddress,
      usdtPoolAddress,
    ]
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
