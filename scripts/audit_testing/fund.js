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

  const daiPool = await getApyPool(NETWORK_NAME, "DAI");
  const daiTopUp = await daiPool.getReserveTopUpValue();
  const daiAmount = await daiPool.getUnderlyerAmountFromValue(
    Math.abs(daiTopUp)
  );
  console.log(daiAmount.div(tokenAmountToBigNumber(1)).toString());

  const usdcPool = await getApyPool(NETWORK_NAME, "USDC");
  const usdcTopUp = await usdcPool.getReserveTopUpValue();
  const usdcAmount = await usdcPool.getUnderlyerAmountFromValue(
    Math.abs(usdcTopUp)
  );
  console.log(usdcAmount.div(tokenAmountToBigNumber(1)).toString());

  const usdtPool = await getApyPool(NETWORK_NAME, "USDT");
  const usdtTopUp = await usdtPool.getReserveTopUpValue();
  const usdtAmount = await usdtPool.getUnderlyerAmountFromValue(
    Math.abs(usdtTopUp)
  );
  console.log(usdtAmount.div(tokenAmountToBigNumber(1)).toString());

  const accountId = bytes32("alpha");
  await poolManager.fundAccount(accountId, [
    {
      poolId: bytes32("daiPool"),
      amount: daiAmount,
    },
    {
      poolId: bytes32("usdcPool"),
      amount: usdcAmount,
    },
    {
      poolId: bytes32("usdtPool"),
      amount: usdtAmount,
    },
  ]);
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
