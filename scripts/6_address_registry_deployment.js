require("dotenv").config();
const { assert } = require("chai");
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("@nomiclabs/buidler");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");
const { updateDeployJsons } = require("../utils/helpers.js");

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  const chainId = CHAIN_IDS[NETWORK_NAME];

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);

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
