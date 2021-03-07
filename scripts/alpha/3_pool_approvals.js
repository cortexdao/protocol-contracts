const hre = require("hardhat");
const { ethers, network } = hre;
const chalk = require("chalk");
const { getDeployedAddress, getGasPrice } = require("../../utils/helpers");

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  const managerAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  for (const symbol of ["DAI", "USDC", "USDC"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    const gasPrice = await getGasPrice(argv.gasPrice);
    const pool = await ethers.getContractAt("APYPoolTokenV2", poolAddress);
    const trx = await pool.infiniteApprove(managerAddress, { gasPrice });
    await trx.wait();

    console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
    console.log("");
    console.log(
      `${chalk.yellow("USDT")} Pool: ${chalk.green(
        poolAddress
      )} has given the Manager: ${chalk.green(
        managerAddress
      )} infinite approval to move funds`
    );
    console.log("");
  }
}

if (!module.parent) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
