require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  getDeployedAddress,
  getGasPrice,
  updateDeployJsons,
  bytes32,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const poolManagerDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
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
  let gasUsed = BigNumber.from("0");

  let gasPrice = await getGasPrice(argv.gasPrice);
  const proxyAdmin = await ProxyAdmin.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxyAdmin.deployTransaction.hash}`
  );
  let receipt = await proxyAdmin.deployTransaction.wait();
  deploy_data["PoolManagerProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${chalk.green(proxyAdmin.address)}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await PoolManager.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  receipt = await logic.deployTransaction.wait();
  deploy_data["PoolManager"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  gasPrice = await getGasPrice(argv.gasPrice);
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const proxy = await PoolManagerProxy.deploy(
    logic.address,
    proxyAdmin.address,
    addressRegistryAddress,
    { gasPrice }
  );
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
  );
  receipt = await proxy.deployTransaction.wait();
  deploy_data["PoolManagerProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  updateDeployJsons(networkName, deploy_data);

  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: addressRegistryDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress,
    addressRegistryDeployer
  );
  let trx = await addressRegistry.registerAddress(
    bytes32("poolManager"),
    proxy.address
  );
  console.log("Register address", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(trx.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: proxy.address,
      constructorArguments: [
        logic.address,
        proxyAdmin.address,
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
