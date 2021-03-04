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

  const newManagerLogic = await ethers.getContractFactory("APYManager");
  const newManagerLogicContract = await newManagerLogic.deploy();

  console.log(
    `New Implementation Logic for Manager: ${chalk.green(
      newManagerLogicContract.address
    )}`
  );

  const ManagerAdmin = await ethers.getContractAt(
    legos.apy.abis.APY_MANAGER_Admin,
    legos.apy.addresses.APY_MANAGER_Admin
  );

  await ManagerAdmin.upgrade(
    legos.apy.addresses.APY_MANAGER,
    newManagerLogicContract.address
  );
  console.log(
    `${chalk.yellow("Manager")}: ${chalk.green(
      legos.apy.addresses.APY_MANAGER
    )}, Logic: ${chalk.green(newManagerLogicContract.address)}`
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
