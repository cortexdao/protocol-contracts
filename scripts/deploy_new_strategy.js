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

  const MANAGER_CONTRACT = await ethers.getContractAt(
    legos.apy.abis.APY_MANAGER_Logic,
    legos.apy.adresses.APY_MANAGER
  );
  const newStrategyAddress = await MANAGER_CONTRACT.callStatic.deploy(
    legos.apy.addresses.APY_GENERIC_EXECUTOR
  );
  await MANAGER_CONTRACT.deploy(legos.apy.addresses.APY_GENERIC_EXECUTOR);

  console.log(
    `Manager: ${chalk.green(
      legos.apy.addresses.APY_MANAGER
    )} deployed a new Strategy: ${newStrategyAddress} pointing to ${
      legos.apy.addresses.APY_GENERIC_EXECUTOR
    }`
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
