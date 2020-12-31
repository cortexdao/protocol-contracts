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

  const managerProxyAddress = getDeployedAddress(
    "APYManagerProxy",
    NETWORK_NAME
  );
  const APYManager = (await ethers.getContractFactory("APYManager")).connect(
    managerWallet
  );
  const manager = await APYManager.attach(managerProxyAddress);

  const APYPoolToken = (
    await ethers.getContractFactory("APYPoolToken")
  ).connect(poolWallet);

  console.log("Approving manager for pools ...");
  let poolProxyAddress;
  for (const { symbol } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    poolProxyAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    const pool = await APYPoolToken.attach(poolProxyAddress);
    await pool.infiniteApprove(manager.address);
  }
  console.log("... done.");
  console.log("");

  //
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
