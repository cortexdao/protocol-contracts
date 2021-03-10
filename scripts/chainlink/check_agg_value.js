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
const { getDeployedAddress } = require("../../utils/helpers");

const AGG_ADDRESS = "0x344D5d70fc3c3097f82d1F26464aaDcEb30C6AC7";

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

  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");
  const aggregator = await FluxAggregator.attach(AGG_ADDRESS);

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
