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
const { commify, formatUnits } = require("../../utils/helpers");

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

  const daiPool = await getApyPool(NETWORK_NAME, "DAI");
  const daiBal = await daiPool.getPoolUnderlyerValue();
  const daiTopUp = await daiPool.getReserveTopUpValue();

  const usdcPool = await getApyPool(NETWORK_NAME, "USDC");
  const usdcBal = await usdcPool.getPoolUnderlyerValue();
  const usdcTopUp = await usdcPool.getReserveTopUpValue();

  const usdtPool = await getApyPool(NETWORK_NAME, "USDT");
  const usdtBal = await usdtPool.getPoolUnderlyerValue();
  const usdtTopUp = await usdtPool.getReserveTopUpValue();

  console.log(
    `DAI Pool Amount / Top Up: $${commify(formatUnits(daiBal, 8))}, $${commify(
      formatUnits(daiTopUp, 8)
    )}`
  );
  console.log(
    `USDC Pool Amount / Top Up: $${commify(
      formatUnits(usdcBal, 8)
    )}, $${commify(formatUnits(usdcTopUp, 8))}`
  );
  console.log(
    `USDT Pool Amount / Top Up: $${commify(
      formatUnits(usdtBal, 8)
    )}, $${commify(formatUnits(usdtTopUp, 8))}`
  );
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
