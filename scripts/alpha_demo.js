require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const {
  updateDeployJsons,
  getDeployedAddress,
} = require("../utils/helpers.js");
const { TOKEN_AGG_MAP } = require("../utils/constants.js");

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

  const POOL_MNEMONIC = process.env.POOL_MNEMONIC;
  const poolWallet = ethers.Wallet.fromMnemonic(POOL_MNEMONIC).connect(
    ethers.provider
  );
  const poolDeployerAddress = poolWallet.address;
  console.log("");
  console.log("Pool deployer address:", poolDeployerAddress);
  console.log("");

  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: poolDeployerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  let ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYPoolToken = (
    await ethers.getContractFactory("APYPoolToken")
  ).connect(poolWallet);

  ProxyAdmin = ProxyAdmin.connect(poolWallet);
  const poolProxyAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const poolProxyAdmin = await ProxyAdmin.attach(poolProxyAdminAddress);

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

  const MANAGER_MNEMONIC = process.env.MANAGER_MNEMONIC;
  const managerWallet = ethers.Wallet.fromMnemonic(MANAGER_MNEMONIC).connect(
    ethers.provider
  );
  const managerDeployerAddress = managerWallet.address;
  console.log("");
  console.log("Manager deployer address:", managerDeployerAddress);
  console.log("");

  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: managerDeployerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  const managerProxyAdminAddress = getDeployedAddress(
    "APYManagerProxyAdmin",
    NETWORK_NAME
  );
  ProxyAdmin = ProxyAdmin.connect(managerWallet);
  const managerProxyAdmin = await ProxyAdmin.attach(managerProxyAdminAddress);

  const APYManager = (await ethers.getContractFactory("APYManager")).connect(
    managerWallet
  );
  const newManagerLogic = await APYManager.deploy();
  await newManagerLogic.deployed();
  console.log(`New Implementation Logic: ${newManagerLogic.address}`);
  console.log("");

  const managerProxyAddress = getDeployedAddress(
    "APYManagerProxy",
    NETWORK_NAME
  );
  await managerProxyAdmin.upgrade(managerProxyAddress, newManagerLogic.address);

  const deploy_data = {
    APYManager: newManagerLogic.address,
  };
  updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
