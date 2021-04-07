#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.  Values are passed like so:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js --arg1=val1 --arg2=val2
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ MNEMONIC='' yarn fork:mainnet
 */
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = hre;
const { commify, formatUnits } = require("../../utils/helpers");

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
    answerUSD,
    startedAt,
    updatedAt,
    answeredInRound,
  ] = await aggregator.latestRoundData();
  console.log("roundId", roundId.toString());
  console.log(`answer: $ ${commify(formatUnits(answerUSD, 8))}`);
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
