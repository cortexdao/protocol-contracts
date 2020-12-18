require("dotenv").config();
const hre = require("hardhat");
const { artifacts, ethers, network } = require("hardhat");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");
const { updateDeployJsons } = require("../utils/helpers.js");

const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON["APYManagerProxyAdmin"]);
const MANAGER_PROXY_ADDRESSES = require(DEPLOYS_JSON["APYManagerProxy"]);

const ContractData = artifacts.require("APYManager");

async function main() {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYManager = await ethers.getContractFactory("APYManager");

  const proxyAdmin = await ProxyAdmin.attach(
    PROXY_ADMIN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );

  const newLogic = await APYManager.deploy();
  await newLogic.deployed();
  console.log(`New Implementation Logic: ${newLogic.address}`);

  const proxyAddress = MANAGER_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]];

  const iImplementation = new ethers.utils.Interface(ContractData.abi);
  const initData = iImplementation.encodeFunctionData("initializeUpgrade", []);

  // NOTE: Select 1 of the following
  await proxyAdmin.upgradeAndCall(proxyAddress, newLogic.address, initData);
  // await proxyAdmin.upgrade(proxyAddress, newLogic.address)

  let deploy_data = {};
  deploy_data["APYManager"] = newLogic.address;
  await updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
