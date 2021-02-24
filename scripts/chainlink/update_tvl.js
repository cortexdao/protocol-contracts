/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  getDeployedAddress,
  tokenAmountToBigNumber,
  MAX_UINT256,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Deployer address:", deployer.address);
  console.log("");

  // TODO: this won't work anymore with the new V2 pools + mAPT.
  // Need to deploy mAPT and have the node pick up TVL
  // changes to submit to the aggregator
  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  const registry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress
  );
  const daiPoolAddress = await registry.daiPoolAddress();
  const daiPool = await ethers.getContractAt("APYPoolToken", daiPoolAddress);
  const daiAddress = await daiPool.underlyer();
  const underlyer = await ethers.getContractAt("IDetailedERC20", daiAddress);
  const amount = tokenAmountToBigNumber("1000", await underlyer.decimals());
  let trx = await underlyer.approve(daiPool.address, MAX_UINT256);
  await trx.wait();
  trx = await daiPool.addLiquidity(amount);
  await trx.wait();
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
