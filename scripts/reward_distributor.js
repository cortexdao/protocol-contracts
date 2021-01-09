#!/usr/bin/env node

const { argv } = require("yargs")
  .option("amount", {
    type: "number",
    description: 'Transfer amount in token ("big") units',
  })
  .option("dryRun", {
    type: "boolean",
    description: "Simulates transactions to estimate ETH cost",
  })
  .option("gasPrice", {
    type: "number",
    description: "Gas price in gwei; omitting uses EthGasStation value",
  })
  .demandOption(["amount"]);
const hre = require("hardhat");
const { network, ethers } = hre;
const {
  tokenAmountToBigNumber,
  getDeployedAddress,
  getGasPrice,
} = require("../utils/helpers.js");

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const TOKEN_MNEMONIC = process.env.TOKEN_MNEMONIC;
  if (!TOKEN_MNEMONIC) {
    throw new Error("Must set TOKEN_MNEMONIC env var.");
  }
  const apyTokenDeployer = ethers.Wallet.fromMnemonic(TOKEN_MNEMONIC).connect(
    ethers.provider
  );
  console.log("APY Token deployer:", apyTokenDeployer.address);
  console.log("");

  let gasPrice = await getGasPrice(argv.gasPrice);
  console.log("");

  const amount = tokenAmountToBigNumber(argv.amount, "18");

  const APYGovernanceToken = await ethers.getContractFactory(
    "APYGovernanceToken"
  );
  const apyTokenAddress = getDeployedAddress(
    "APYGovernanceTokenProxy",
    NETWORK_NAME
  );
  const token = await APYGovernanceToken.attach(apyTokenAddress).connect(
    apyTokenDeployer
  );

  const rewardDistributorAddress = getDeployedAddress(
    "APYRewardDistributor",
    NETWORK_NAME
  );

  if (argv.dryRun) {
    console.log("");
    console.log("Doing a dry run ...");
    console.log("");
    console.log(
      "Token amount (wei):",
      amount.toString(),
      `(length: ${amount.toString().length})`
    );
    console.log("");

    const gasEstimate = await token.estimateGas.transfer(
      rewardDistributorAddress,
      amount
    );
    const ethCost = gasEstimate.mul(gasPrice).toString() / 1e18;
    console.log("Estimated ETH cost:", ethCost.toString());

    const balance =
      (await ethers.provider.getBalance(apyTokenDeployer.address)).toString() /
      1e18;
    console.log("Current ETH balance for token deployer:", balance.toString());
    console.log("");
  } else {
    const tx = await token.transfer(rewardDistributorAddress, amount, {
      gasPrice: gasPrice,
    });
    console.log("Etherscan:", `https://etherscan.io/tx/${tx.hash}`);

    await tx.wait();
    console.log(`Transferred ${amount} tokens to ${rewardDistributorAddress}`);
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Reward distributor funded successfully.");
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
