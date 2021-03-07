require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const chalk = require("chalk");
const { getDeployedAddress, getGasPrice } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const POOL_MNEMONIC = process.env.POOL_MNEMONIC;
  const poolDeployer = ethers.Wallet.fromMnemonic(POOL_MNEMONIC).connect(
    ethers.provider
  );
  console.log("Deployer address:", poolDeployer.address);
  /* TESTING on localhost only
   * useful if running out of ETH for deployer address
   */
  // const [funder] = await ethers.getSigners();
  // const fundingTrx = await funder.sendTransaction({
  //   to: poolDeployer.address,
  //   value: ethers.utils.parseEther("1.0"),
  // });
  // await fundingTrx.wait();

  const balance =
    (await ethers.provider.getBalance(poolDeployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Approving manager for pools ...");
  console.log("");

  const managerAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  console.log("Manager:", chalk.green(managerAddress));
  console.log("");
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    console.log(`${symbol} pool:`, chalk.green(poolAddress));
    const gasPrice = await getGasPrice(argv.gasPrice);
    const pool = await ethers.getContractAt(
      "APYPoolTokenV2",
      poolAddress,
      poolDeployer
    );
    const trx = await pool.infiniteApprove(managerAddress, { gasPrice });
    console.log("Approve:", `https://etherscan.io/tx/${trx.hash}`);
    await trx.wait();
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Approvals successful.");
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
