require("dotenv").config();
const { ethers, network } = require("hardhat");
const chalk = require("chalk");
const legos = require("@apy-finance/defi-legos");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log(`Deployer: ${chalk.green(deployer)}`);

  const APY_DAI_POOL = await ethers.getContractAt(
    legos.apy.abis.APY_DAI_POOL_Logic,
    legos.apy.addresses.APY_DAI_POOL
  );
  const APY_USDC_POOL = await ethers.getContractAt(
    legos.apy.abis.APY_USDC_POOL_Logic,
    legos.apy.addresses.APY_USDC_POOL
  );
  const APY_USDT_POOL = await ethers.getContractAt(
    legos.apy.abis.APY_USDT_POOL_Logic,
    legos.apy.addresses.APY_USDT_POOL
  );

  APY_DAI_POOL.infiniteApprove(legos.apy.addresses.APY_MANAGER);
  console.log(
    `${chalk.yellow("DAI")} Pool: ${chalk.green(
      legos.apy.addresses.APY_DAI_POOL
    )} has given the Manager: ${chalk.green(
      legos.apy.addresses.APY_MANAGER
    )} infinite approval to move funds`
  );
  APY_USDC_POOL.infiniteApprove(legos.apy.addresses.APY_MANAGER);
  console.log(
    `${chalk.yellow("USDC")} Pool: ${chalk.green(
      legos.apy.addresses.APY_USDC_POOL
    )} has given the Manager: ${chalk.green(
      legos.apy.addresses.APY_MANAGER
    )} infinite approval to move funds`
  );
  APY_USDT_POOL.infiniteApprove(legos.apy.addresses.APY_MANAGER);
  console.log(
    `${chalk.yellow("USDT")} Pool: ${chalk.green(
      legos.apy.addresses.APY_USDT_POOL
    )} has given the Manager: ${chalk.green(
      legos.apy.addresses.APY_MANAGER
    )} infinite approval to move funds`
  );
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
