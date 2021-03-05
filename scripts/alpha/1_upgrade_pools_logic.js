require("dotenv").config();
const { ethers, network } = require("hardhat");
const chalk = require("chalk");
const { getDeployedAddress } = require("../../utils/helpers");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log(`Deployer: ${chalk.green(deployer)}`);

  const newPoolLogic = await ethers.getContractFactory("APYPoolTokenV2");
  const newPoolLogicContract = await newPoolLogic.deploy();

  console.log(
    `New Implementation Logic for Pools: ${chalk.green(
      newPoolLogicContract.address
    )}`
  );

  const poolAdmin = getDeployedAddress("APYPoolTokenProxyAdmin", NETWORK_NAME);

  for (const symbol of ["DAI", "USDC", "USDC"]) {
    await poolAdmin.upgrade(
      legos.apy.addresses.APY_DAI_POOL,
      newPoolLogicContract.address
    );
    console.log(
      `${chalk.yellow("DAI")} Pool: ${chalk.green(
        legos.apy.addresses.APY_DAI_POOL
      )}, Logic: ${chalk.green(newPoolLogicContract.address)}`
    );
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
