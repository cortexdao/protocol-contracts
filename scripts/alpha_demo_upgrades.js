require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const {
  updateDeployJsons,
  getDeployedAddress,
} = require("../utils/helpers.js");
const { TOKEN_AGG_MAP } = require("../utils/constants.js");

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

  let ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const poolProxyAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  let poolProxyAdmin = await ProxyAdmin.attach(poolProxyAdminAddress);
  const poolOwnerAddress = await poolProxyAdmin.owner();
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [poolOwnerAddress],
  });
  const poolSigner = await ethers.provider.getSigner(poolOwnerAddress);
  poolProxyAdmin = poolProxyAdmin.connect(poolSigner);
  console.log("");
  console.log("Pool deployer address:", await poolSigner.getAddress());
  console.log("");
  const APYPoolToken = (
    await ethers.getContractFactory("APYPoolToken")
  ).connect(poolSigner);
  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: poolOwnerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  let poolProxyAddress;
  for (const { symbol } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    const newLogic = await APYPoolToken.deploy();
    await newLogic.deployed();
    console.log(`New Implementation Logic: ${newLogic.address}`);

    poolProxyAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    await poolProxyAdmin.upgrade(poolProxyAddress, newLogic.address);

    //Update Jsons
    const deploy_data = {};
    deploy_data[symbol + "_APYPoolToken"] = newLogic.address;
    updateDeployJsons(NETWORK_NAME, deploy_data);
  }

  let APYManager = await ethers.getContractFactory("APYManager");
  const managerProxyAddress = getDeployedAddress(
    "APYManagerProxy",
    NETWORK_NAME
  );
  const manager = await APYManager.attach(managerProxyAddress);
  const managerOwnerAddress = await manager.owner();
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [managerOwnerAddress],
  });
  const managerSigner = await ethers.provider.getSigner(managerOwnerAddress);
  console.log("");
  console.log("Manager deployer address:", await managerSigner.getAddress());
  console.log("");
  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: managerOwnerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  const managerProxyAdminAddress = getDeployedAddress(
    "APYManagerProxyAdmin",
    NETWORK_NAME
  );
  const managerProxyAdmin = (
    await ProxyAdmin.attach(managerProxyAdminAddress)
  ).connect(managerSigner);

  APYManager = APYManager.connect(managerSigner);
  const newManagerLogic = await APYManager.deploy();
  await newManagerLogic.deployed();
  console.log(`New Implementation Logic: ${newManagerLogic.address}`);
  console.log("");

  await managerProxyAdmin.upgrade(managerProxyAddress, newManagerLogic.address);

  const deploy_data = {
    APYManager: newManagerLogic.address,
  };
  updateDeployJsons(NETWORK_NAME, deploy_data);
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
