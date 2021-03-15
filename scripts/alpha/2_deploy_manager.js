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
  const [funder] = await ethers.getSigners();
  const fundingTrx = await funder.sendTransaction({
    to: managerDeployer.address,
    value: ethers.utils.parseEther("1.0"),
  });
  await fundingTrx.wait();

  const balance =
    (await ethers.provider.getBalance(managerDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying manager ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory(
    "ProxyAdmin",
    managerDeployer
  );
  const APYManagerV2 = await ethers.getContractFactory(
    "APYManagerV2",
    managerDeployer
  );
  const APYManagerProxy = await ethers.getContractFactory(
    "APYManagerProxy",
    managerDeployer
  );

  let deploy_data = {};

  let gasPrice = await getGasPrice(argv.gasPrice);
  const proxyAdmin = await ProxyAdmin.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxyAdmin.deployTransaction.hash}`
  );
  await proxyAdmin.deployed();
  deploy_data["APYManagerProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${chalk.green(proxyAdmin.address)}`);
  console.log("");
  assert.strictEqual(
    await proxyAdmin.owner(),
    managerDeployer.address,
    "Owner must be manager deployer"
  );

  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await APYManagerV2.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  await logic.deployed();
  deploy_data["APYManager"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  const mAptAddress = getDeployedAddress("APYMetaPoolTokenProxy", NETWORK_NAME);
  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  const proxy = await APYManagerProxy.deploy(
    logic.address,
    proxyAdmin.address,
    mAptAddress,
    addressRegistryAddress,
    { gasPrice }
  );
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
  );
  await proxy.deployed();
  deploy_data["APYManagerProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);
  console.log("");

  updateDeployJsons(NETWORK_NAME, deploy_data);

  gasPrice = await getGasPrice(argv.gasPrice);
  const MAPT_MNEMONIC = process.env.MAPT_MNEMONIC;
  const mAptDeployer = ethers.Wallet.fromMnemonic(MAPT_MNEMONIC).connect(
    ethers.provider
  );
  const mAPT = await ethers.getContractAt(
    "APYMetaPoolToken",
    mAptAddress,
    mAptDeployer
  );
  const trx = await mAPT.setManagerAddress(proxy.address, { gasPrice });
  console.log(
    "Set manager address on mAPT:",
    `https://etherscan.io/tx/${trx.hash}`
  );
  await trx.wait();
  console.log("");

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(proxy.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: proxy.address,
      constructorArguments: [
        logic.address,
        proxyAdmin.address,
        mAptAddress,
        addressRegistryAddress,
      ],
      // to avoid the "More than one contract was found to match the deployed bytecode."
      // with proxy contracts that only differ in constructors but have the same bytecode
      contract: "contracts/APYManagerProxy.sol:APYManagerProxy",
    });
    await hre.run("verify:verify", {
      address: logic.address,
    });
    await hre.run("verify:verify", {
      address: proxyAdmin.address,
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Manager deployment successful.");
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
