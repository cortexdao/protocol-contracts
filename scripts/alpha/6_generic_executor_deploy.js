require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const { BigNumber } = ethers;
const chalk = require("chalk");
const { getGasPrice, updateDeployJsons } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const MANAGER_MNEMONIC = process.env.MANAGER_MNEMONIC;
  const managerDeployer = ethers.Wallet.fromMnemonic(MANAGER_MNEMONIC).connect(
    ethers.provider
  );
  console.log("Deployer address:", managerDeployer.address);
  /* TESTING on localhost only
   * may need to fund the deployer while testing
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: managerDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(managerDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying generic executor ...");
  console.log("");

  let gasUsed = BigNumber.from("0");

  const GenericExecutor = await ethers.getContractFactory(
    "GenericExecutor",
    managerDeployer
  );
  let gasPrice = await getGasPrice(argv.gasPrice);
  const genericExecutor = await GenericExecutor.deploy({ gasPrice });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${genericExecutor.deployTransaction.hash}`
  );
  await genericExecutor.deployed();
  console.log("Generic Executor", chalk.green(genericExecutor.address));
  console.log("");

  const deployData = {
    GenericExecutor: genericExecutor.address,
  };
  updateDeployJsons(networkName, deployData);

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      genericExecutor.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: genericExecutor.address,
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Executor deployment successful.");
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
