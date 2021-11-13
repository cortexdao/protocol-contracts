#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/frontend/deploy_agg.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ ENABLE_FORKING=true yarn hardhat node
 */
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = hre;
const assert = require("assert");
const chalk = require("chalk");
const {
  ZERO_ADDRESS,
  tokenAmountToBigNumber,
  acquireToken,
} = require("../../utils/helpers");

console.logAddress = function (contractName, contractAddress) {
  contractName = contractName + ":";
  contractAddress = chalk.green(contractAddress);
  console.log.apply(this, [contractName, contractAddress]);
};

console.logDone = function () {
  console.log("");
  console.log.apply(this, [chalk.green("√") + " ... done."]);
  console.log("");
};

const NODE_ADDRESS = "0xAD702b65733aC8BcBA2be6d9Da94d5b7CE25C0bb";
const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
// Aave lending pool
// https://etherscan.io/address/0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3
const WHALE_ADDRESS = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3";

async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");
  assert(
    ["LOCALHOST", "TESTNET"].includes(networkName),
    "This script is for forked mainnet testing only."
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

  console.log("Deploying FluxAggregator ...");

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
  // console.log(`Chainlink node: ${chalk.green(NODE_ADDRESS)}`);
  console.logAddress("Chainlink node", NODE_ADDRESS);
  console.logAddress("LINK token", LINK_ADDRESS);
  console.logAddress("FluxAggregator", aggregator.address);
  console.logDone();

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
  console.logDone();

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
  console.logDone();

  console.log("Funding oracle node with ETH ...");
  const ethAmount = tokenAmountToBigNumber(argv.ethAmount || "50");
  trx = await deployer.sendTransaction({
    to: NODE_ADDRESS,
    value: ethAmount,
  });
  await trx.wait();
  console.logDone();

  console.log("");
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Deployment successful.");
      console.log("");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
