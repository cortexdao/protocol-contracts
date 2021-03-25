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
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const ACCOUNT_MANAGER_MNEMONIC = process.env.ACCOUNT_MANAGER_MNEMONIC;
  const accountManagerDeployer = ethers.Wallet.fromMnemonic(
    ACCOUNT_MANAGER_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", accountManagerDeployer.address);
  /* TESTING on localhost only
   * may need to fund the deployer while testing
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: accountManagerDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (
      await ethers.provider.getBalance(accountManagerDeployer.address)
    ).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying Account Manager ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory(
    "ProxyAdmin",
    accountManagerDeployer
  );
  const AccountManager = await ethers.getContractFactory(
    "AccountManager",
    accountManagerDeployer
  );
  const AccountManagerProxy = await ethers.getContractFactory(
    "AccountManagerProxy",
    accountManagerDeployer
  );

  let deploy_data = {};
  let gasUsed = BigNumber.from("0");

  let gasPrice = await getGasPrice(argv.gasPrice);
  const proxyAdmin = await ProxyAdmin.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxyAdmin.deployTransaction.hash}`
  );
  await proxyAdmin.deployTransaction.wait();
  deploy_data["AccountManagerProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${chalk.green(proxyAdmin.address)}`);
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await AccountManager.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  await logic.deployTransaction.wait();
  deploy_data["AccountManager"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const proxy = await AccountManagerProxy.deploy(
    logic.address,
    proxyAdmin.address,
    addressRegistryAddress,
    { gasPrice }
  );
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
  );
  await proxy.deployTransaction.wait();
  deploy_data["AccountManagerProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);
  console.log("");

  updateDeployJsons(networkName, deploy_data);

  // TODO: update address registry

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(proxy.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: proxy.address,
      constructorArguments: [
        logic.address,
        proxyAdmin.address,
        addressRegistryAddress,
      ],
      // to avoid the "More than one contract was found to match the deployed bytecode."
      // with proxy contracts that only differ in constructors but have the same bytecode
      contract: "contracts/AccountManagerProxy.sol:AccountManagerProxy",
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
