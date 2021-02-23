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
  tokenAmountToBigNumber,
  getAggregatorAddress,
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
  const oracle = signers[1];
  console.log("Deployer address:", deployer.address);
  console.log("");

  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");
  const tvlAggAddress = getAggregatorAddress("TVL", NETWORK_NAME);
  const aggregator = await FluxAggregator.attach(tvlAggAddress);
  console.log("TVL aggregator:", tvlAggAddress);

  const tvl = tokenAmountToBigNumber(argv.amount || "52300000", "8");
  const roundId = (await aggregator.latestRound()).add(1);
  console.log(`Submitting - TVL: ${tvl}, Round ID: ${roundId}`);
  await aggregator.connect(oracle).submit(roundId, tvl);
  console.log("Submitted successfully.");
  console.log("");
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
