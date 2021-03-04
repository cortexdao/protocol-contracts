require("dotenv").config();
const { ethers, network } = require("hardhat");
const chalk = require("chalk");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log(`Deployer: ${chalk.green(deployer)}`);

  const genericExecutor = await ethers.getContractFactory("APYGenericExecutor");
  const genericExecutorContract = await genericExecutor.deploy();
  console.log(
    `New Generic Executor: ${chalk.green(genericExecutorContract.address)}`
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
