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

  const newPoolLogic = await ethers.getContractFactory("APYPoolTokenV2");
  const newPoolLogicContract = await newPoolLogic.deploy();

  console.log(
    `New Implementation Logic for Pools: ${chalk.green(
      newPoolLogicContract.address
    )}`
  );

  const PoolAdmin = await ethers.getContractAt(
    legos.apy.abis.APY_POOL_Admin,
    legos.apy.addresses.APY_POOL_Admin
  );

  await PoolAdmin.upgrade(
    legos.apy.addresses.APY_DAI_POOL,
    newPoolLogicContract.address
  );
  console.log(
    `${chalk.yellow("DAI")} Pool: ${chalk.green(
      legos.apy.addresses.APY_DAI_POOL
    )}, Logic: ${chalk.green(newPoolLogicContract.address)}`
  );
  await PoolAdmin.upgrade(
    legos.apy.addresses.APY_USDC_POOL,
    newPoolLogicContract.address
  );
  console.log(
    `${chalk.yellow("USDC")} Pool: ${chalk.green(
      legos.apy.addresses.APY_USDC_POOL
    )}, Logic: ${chalk.green(newPoolLogicContract.address)}`
  );
  await PoolAdmin.upgrade(
    legos.apy.addresses.APY_USDT_POOL,
    newPoolLogicContract.address
  );
  console.log(
    `${chalk.yellow("USDT")} Pool: ${chalk.green(
      legos.apy.addresses.APY_USDT_POOL
    )}, Logic: ${chalk.green(newPoolLogicContract.address)}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
