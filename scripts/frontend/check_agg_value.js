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
const { getAggregatorAddress } = require("../../utils/helpers");

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

  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");
  const tvlAggAddress = getAggregatorAddress("TVL", NETWORK_NAME);
  const aggregator = await FluxAggregator.attach(tvlAggAddress);
  console.log("TVL aggregator:", tvlAggAddress);
  console.log("");

  const [
    roundId,
    answer,
    startedAt,
    updatedAt,
    answeredInRound,
  ] = await aggregator.latestRoundData();
  console.log("roundId", roundId.toString());
  console.log("answer:", answer.toString());
  console.log("startedAt:", startedAt.toString());
  console.log("updatedAt:", updatedAt.toString());
  console.log("answeredInRound:", answeredInRound.toString());
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
