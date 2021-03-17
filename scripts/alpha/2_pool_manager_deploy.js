require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
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
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const POOL_MANAGER_MNEMONIC = process.env.POOL_MANAGER_MNEMONIC;
  const poolManagerDeployer = ethers.Wallet.fromMnemonic(
    POOL_MANAGER_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", poolManagerDeployer.address);
  /* TESTING on localhost only
   * may need to fund the deployer while testing
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: poolManagerDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(poolManagerDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying Pool Manager ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory(
    "ProxyAdmin",
    poolManagerDeployer
  );
  const PoolManager = await ethers.getContractFactory(
    "PoolManager",
    poolManagerDeployer
  );
  const PoolManagerProxy = await ethers.getContractFactory(
    "PoolManagerProxy",
    poolManagerDeployer
  );

  let deploy_data = {};

  let gasPrice = await getGasPrice(argv.gasPrice);
  const proxyAdmin = await ProxyAdmin.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxyAdmin.deployTransaction.hash}`
  );
  await proxyAdmin.deployed();
  deploy_data["ManagerProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${chalk.green(proxyAdmin.address)}`);
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await PoolManager.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  await logic.deployed();
  deploy_data["PoolManager"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  const mAptAddress = getDeployedAddress("MetaPoolTokenProxy", networkName);
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const proxy = await PoolManagerProxy.deploy(
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
  deploy_data["PoolManagerProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);
  console.log("");

  updateDeployJsons(networkName, deploy_data);

  const MAPT_MNEMONIC = process.env.MAPT_MNEMONIC;
  const mAptDeployer = ethers.Wallet.fromMnemonic(MAPT_MNEMONIC).connect(
    ethers.provider
  );
  const mAPT = await ethers.getContractAt(
    "MetaPoolToken",
    mAptAddress,
    mAptDeployer
  );
  gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await mAPT.setManagerAddress(proxy.address, { gasPrice });
  console.log(
    "Set manager address on mAPT:",
    `https://etherscan.io/tx/${trx.hash}`
  );
  await trx.wait();
  console.log("");

  const TVL_MANAGER_MNEMONIC = process.env.TVL_MANAGER_MNEMONIC;
  const tvlManagerDeployer = ethers.Wallet.fromMnemonic(
    TVL_MANAGER_MNEMONIC
  ).connect(ethers.provider);
  const tvlManagerAddress = getDeployedAddress("TVLManager", networkName);
  const tvlManager = await ethers.getContractAt(
    "TVLManager",
    tvlManagerAddress,
    tvlManagerDeployer
  );
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await tvlManager.setPoolManagerAddress(proxy.address, { gasPrice });
  console.log(
    "Set pool manager on TVL manager:",
    `https://etherscan.io/tx/${trx.hash}`
  );
  await trx.wait();
  console.log("");

  if (["KOVAN", "MAINNET"].includes(networkName)) {
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
      contract: "contracts/PoolManagerProxy.sol:PoolManagerProxy",
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
