require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
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

  const managerAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  const manager = await ethers.getContractAt(
    "APYManagerV2",
    managerAddress,
    managerDeployer
  );
  console.log("Manager (proxy):", chalk.green(managerAddress));
  const executorAddress = getDeployedAddress(
    "APYGenericExecutor",
    NETWORK_NAME
  );
  console.log("Executor:", chalk.green(executorAddress));
  const accountId = bytes32("alpha");
  let gasPrice = await getGasPrice(argv.gasPrice);
  const trx = await manager.deployAccount(accountId, executorAddress, {
    gasPrice,
  });
  console.log("Deploy account:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  const accountAddress = await manager.getAccount(accountId);
  console.log("Account:", chalk.green(accountAddress));

  const deployData = {
    Account: accountAddress,
  };
  updateDeployJsons(NETWORK_NAME, deployData);

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(trx.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: accountAddress,
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
