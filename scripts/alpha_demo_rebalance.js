require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { getDeployedAddress } = require("../utils/helpers.js");
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

  const poolProxyAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const poolOwnerAddress = await ProxyAdmin.attach(
    poolProxyAdminAddress
  ).owner();
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [poolOwnerAddress],
  });
  const poolSigner = await ethers.provider.getSigner(poolOwnerAddress);
  console.log("");
  console.log("Pool deployer address:", await poolSigner.getAddress());
  console.log("");

  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: poolOwnerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  const APYManager = await ethers.getContractFactory("APYManager");
  const managerProxyAddress = getDeployedAddress(
    "APYManagerProxy",
    NETWORK_NAME
  );
  const managerOwnerAddress = await APYManager.attach(
    managerProxyAddress
  ).owner();
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

  const manager = APYManager.attach(managerProxyAddress).connect(managerSigner);
  const APYPoolToken = (
    await ethers.getContractFactory("APYPoolToken")
  ).connect(poolSigner);

  console.log("Approving manager for pools ...");
  let poolProxyAddress;
  for (const { symbol } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    poolProxyAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    const pool = APYPoolToken.attach(poolProxyAddress);
    await pool.infiniteApprove(manager.address);
  }
  console.log("... done.");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
