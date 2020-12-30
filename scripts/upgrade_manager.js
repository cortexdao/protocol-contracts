require("dotenv").config();
const hre = require("hardhat");
const {
  // artifacts,
  ethers,
  network,
} = hre;
const {
  updateDeployJsons,
  getDeployedAddress,
} = require("../utils/helpers.js");

// const ContractData = artifacts.require("APYManager");

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

  const proxyAdminAddress = getDeployedAddress(
    "APYManagerProxyAdmin",
    NETWORK_NAME
  );
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.attach(proxyAdminAddress);

  const APYManager = await ethers.getContractFactory("APYManager");
  const newLogic = await APYManager.deploy();
  await newLogic.deployed();
  console.log(`New Implementation Logic: ${newLogic.address}`);

  const proxyAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);

  // const iImplementation = new ethers.utils.Interface(ContractData.abi);
  // const initData = iImplementation.encodeFunctionData("initializeUpgrade", []);

  // NOTE: Select 1 of the following
  // await proxyAdmin.upgradeAndCall(proxyAddress, newLogic.address, initData);
  await proxyAdmin.upgrade(proxyAddress, newLogic.address);

  const deploy_data = {
    APYManager: newLogic.address,
  };
  updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
