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
const { getApyPool } = require("./utils");
const { bytes32, tokenAmountToBigNumber } = require("../../utils/helpers");
const { console, getAddressRegistry } = require("./utils");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const addressRegistry = await getAddressRegistry(NETWORK_NAME);
  const poolManagerAddress = await addressRegistry.poolManagerAddress();
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress
  );

  console.log("");
  console.log("Funding strategy account from pools ...");
  console.log("");

  const poolAmounts = [];
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const pool = await getApyPool(NETWORK_NAME, symbol);
    let topUpValue = await pool.getReserveTopUpValue();
    // if (symbol == "DAI")
    //   topUpValue = tokenAmountToBigNumber("500000", "8").mul("-1");
    let topUpAmount;
    if (topUpValue.lt(0)) {
      topUpAmount = await pool.getUnderlyerAmountFromValue(topUpValue.abs());
      poolAmounts.push({
        poolId: bytes32(`${symbol.toLowerCase()}Pool`),
        amount: topUpAmount,
      });
      console.log(
        `${symbol} top-up amount: ${topUpAmount
          .div(tokenAmountToBigNumber(1))
          .toString()}`
      );
    } else {
      console.log(
        "Top-up value is positive:",
        topUpValue.div(tokenAmountToBigNumber(1, 8)).toString()
      );
    }
  }

  await poolManager.fundLpSafe(poolAmounts);
  console.log("... done.");
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Execution successful.");
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
