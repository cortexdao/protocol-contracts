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
const { ZERO_ADDRESS, tokenAmountToBigNumber } = require("./helpers");

const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
const NODE_ADDRESS = "0xAD702b65733aC8BcBA2be6d9Da94d5b7CE25C0bb";

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

  /* Deploy address registry with proxy and admin */
  console.log("");
  console.log("Deploying ...");
  console.log("");

  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");

  const aggregator = await FluxAggregator.deploy(
    LINK_ADDRESS,
    0, // payment amount (price paid for each oracle submission, in wei)
    100000, // timeout before allowing oracle to skip round
    ZERO_ADDRESS, // validator address
    0, // min submission value
    1e12, // max submission value
    0, // decimal offset for answer
    "TVL aggregator" // description
  );
  await aggregator.deployed();
  console.log(`FluxAggregator: ${aggregator.address}`);

  let trx = await aggregator.changeOracles(
    [],
    [NODE_ADDRESS],
    [deployer.address], // owner of node address
    1,
    1,
    0
  );
  await trx.wait();

  trx = await deployer.sendTransaction({
    to: NODE_ADDRESS,
    value: tokenAmountToBigNumber("100", "18"),
  });
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
