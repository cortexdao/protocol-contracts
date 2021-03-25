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
  getGasPrice,
  updateDeployJsons,
  getDeployedAddress,
  bytes32,
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

  let gasUsed = BigNumber.from("0");

  const accountManagerAddress = getDeployedAddress(
    "AccountManagerProxy",
    networkName
  );
  const accountManager = await ethers.getContractAt(
    "AccountManager",
    accountManagerAddress,
    accountManagerDeployer
  );
  console.log("Manager (proxy):", chalk.green(accountManagerAddress));
  const executorAddress = getDeployedAddress("GenericExecutor", networkName);
  console.log("Executor:", chalk.green(executorAddress));
  const accountId = bytes32("alpha");
  let gasPrice = await getGasPrice(argv.gasPrice);
  const trx = await accountManager.deployAccount(accountId, executorAddress, {
    gasPrice,
  });
  console.log("Deploy account:", `https://etherscan.io/tx/${trx.hash}`);
  let receipt = await trx.wait();
  const accountAddress = await accountManager.getAccount(accountId);
  console.log("Account:", chalk.green(accountAddress));
  gasUsed = gasUsed.add(receipt.gasUsed);

  const deployData = {
    Account: accountAddress,
  };
  updateDeployJsons(networkName, deployData);
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(trx.hash, 5); // wait for Etherscan to catch up
    const executorAddress = getDeployedAddress("GenericExecutor", networkName);
    await hre.run("verify:verify", {
      address: accountAddress,
      constructorArguments: [executorAddress],
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Strategy deployment successful.");
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
