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
const { argv } = require("yargs").option("unlock", {
  type: "boolean",
  description: "Unlocks oracle adapter",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const { commify, formatUnits } = require("../../utils/helpers");
const {
  unlockOracleAdapter,
  getRegisteredContract,
} = require("../frontend/utils");

// const AGG_ADDRESS = "0xdb299d394817d8e7bbe297e84afff7106cf92f5f";
const AGG_ADDRESS = "0x344D5d70fc3c3097f82d1F26464aaDcEb30C6AC7";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Deployer address:", deployer.address);
  console.log("");

  console.log("Aggregator:");
  console.log("");
  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");
  const aggregator = await FluxAggregator.attach(AGG_ADDRESS);

  const [roundId, answerUSD, startedAt, updatedAt, answeredInRound] =
    await aggregator.latestRoundData();
  console.log("roundId", roundId.toString());
  console.log(`answer: $ ${commify(formatUnits(answerUSD, 8))}`);
  console.log("startedAt:", startedAt.toString());
  console.log("updatedAt:", updatedAt.toString());
  console.log("answeredInRound:", answeredInRound.toString());
  console.log("");

  console.log("Oracle Adapter:");
  console.log("");
  const oracleAdapter = await getRegisteredContract("oracleAdapter");
  if (argv.unlock) await unlockOracleAdapter();
  try {
    const tvl = await oracleAdapter.getTvl();
    console.log("TVL: $ ", commify(formatUnits(tvl.toString(), 8)));
    console.log("Has override:", await oracleAdapter.hasTvlOverride());
  } catch (error) {
    console.log(error.message);
  }
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
