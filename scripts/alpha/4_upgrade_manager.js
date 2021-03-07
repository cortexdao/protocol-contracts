require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const assert = require("assert");
const { ethers, network } = hre;
const chalk = require("chalk");
const {
  getDeployedAddress,
  getGasPrice,
  updateDeployJsons,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const MANAGER_MNEMONIC = process.env.MANAGER_MNEMONIC;
  const managerDeployer = ethers.Wallet.fromMnemonic(MANAGER_MNEMONIC).connect(
    ethers.provider
  );
  console.log("Deployer address:", managerDeployer.address);
  /* TESTING on localhost only
   * may need to fund the deployer while testing
   */
  // const [funder] = await ethers.getSigners();
  // const fundingTrx = await funder.sendTransaction({
  //   to: managerDeployer.address,
  //   value: ethers.utils.parseEther("1.0"),
  // });
  // await fundingTrx.wait();

  const balance =
    (await ethers.provider.getBalance(managerDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Upgrading manager ...");
  console.log("");

  const proxyAdminAddress = getDeployedAddress(
    "APYManagerProxyAdmin",
    NETWORK_NAME
  );
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    proxyAdminAddress,
    managerDeployer
  );
  assert.strictEqual(
    await proxyAdmin.owner(),
    managerDeployer.address,
    "MNEMONIC needs to be set to manager deployer."
  );

  const proxyAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  const managerV1 = await ethers.getContractAt(
    "APYManager",
    proxyAddress,
    managerDeployer
  );
  console.log("Manager (proxy):", proxyAddress);

  console.log("Deleting deprecated storage ...");
  let gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await managerV1.deleteTokenAddresses({ gasPrice });
  console.log("Delete token addresses:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await managerV1.deletePoolIds({ gasPrice });
  console.log("Delete pool IDs:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  console.log("... done.");
  console.log("");

  console.log("Starting upgrade ...");
  const APYManagerV2 = await ethers.getContractFactory(
    "APYManagerV2",
    managerDeployer
  );
  const logicV2 = await APYManagerV2.deploy();
  console.log(
    "V2 deploy:",
    `https://etherscan.io/tx/${logicV2.deployTransaction.hash}`
  );
  await logicV2.deployed();
  console.log(`Manager logic V2: ${chalk.green(logicV2.address)}`);

  const deployData = {};
  deployData["APYManager"] = logicV2.address;
  updateDeployJsons(NETWORK_NAME, deployData);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await proxyAdmin.upgrade(proxyAddress, logicV2.address, { gasPrice });
  console.log("Upgrade:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  console.log("Upgraded manager to V2.");
  console.log("");

  const mAPTAddress = getDeployedAddress("APYMetaPoolToken", NETWORK_NAME);
  const managerV2 = await ethers.getContractAt(
    "APYManagerV2",
    proxyAddress,
    managerDeployer
  );
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await managerV2.setMetaPoolToken(mAPTAddress, { gasPrice });
  console.log("Set mAPT address:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(logicV2.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: logicV2.address,
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Manager upgrade successful.");
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
