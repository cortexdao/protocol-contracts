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
  ZERO_ADDRESS,
  tokenAmountToBigNumber,
  acquireToken,
} = require("../../utils/helpers");
const assert = require("assert");

const NODE_ADDRESS = "0xAD702b65733aC8BcBA2be6d9Da94d5b7CE25C0bb";
const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
// Aave lending pool
// https://etherscan.io/address/0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3
const WHALE_ADDRESS = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3";

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  assert.strictEqual(
    NETWORK_NAME,
    "LOCALHOST",
    "This script is for local forked mainnet testing only."
  );

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  console.log("Deployer nonce:", nonce);
  console.log("");
  assert.strictEqual(
    nonce,
    0,
    "Nonce must be zero as we rely on deterministic contract addresses."
  );

  console.log("Deploying ...");

  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");

  const paymentAmount = tokenAmountToBigNumber("1", "18");

  const aggregator = await FluxAggregator.deploy(
    LINK_ADDRESS,
    paymentAmount, // payment amount (price paid for each oracle submission, in wei)
    100000, // timeout before allowing oracle to skip round
    ZERO_ADDRESS, // validator address
    0, // min submission value
    tokenAmountToBigNumber(1, "20"), // max submission value
    8, // decimal offset for answer
    "TVL aggregator" // description
  );
  await aggregator.deployed();
  console.log("... done.");
  console.log("");

  console.log(`Chainlink node: ${NODE_ADDRESS}`);
  console.log(`LINK token: ${LINK_ADDRESS}`);
  console.log(`FluxAggregator: ${aggregator.address}`);
  console.log("");

  console.log("Funding aggregator with LINK ...");
  const token = await ethers.getContractAt("IDetailedERC20", LINK_ADDRESS);
  // aggregator must hold enough LINK for two rounds of submissions, i.e.
  // LINK reserve >= 2 * number of oracles * payment amount
  const linkAmount = argv.linkAmount || "100000";
  await acquireToken(
    WHALE_ADDRESS,
    aggregator.address,
    token,
    linkAmount,
    deployer.address
  );
  let trx = await aggregator.updateAvailableFunds();
  await trx.wait();
  console.log("... done.");

  console.log("Registering oracle node ...");
  trx = await aggregator.changeOracles(
    [], // oracles being removed
    [NODE_ADDRESS], // oracles being added
    [deployer.address], // owners of oracles being added
    1, // min number of submissions for a round
    1, // max number of submissions for a round
    0 // number of rounds to wait before oracle can initiate round
  );
  await trx.wait();
  console.log("... done.");

  console.log("Funding oracle node with ETH ...");
  const ethAmount = tokenAmountToBigNumber(argv.ethAmount || "100");
  trx = await deployer.sendTransaction({
    to: NODE_ADDRESS,
    value: ethAmount,
  });
  await trx.wait();
  console.log("... done.");
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
