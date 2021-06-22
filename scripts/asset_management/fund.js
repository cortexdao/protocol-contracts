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
const { program } = require("commander");
const hre = require("hardhat");
const { ethers, network } = hre;
const { bytes32 } = require("../../utils/helpers");
const { getAddressRegistry } = require("./utils");
const { BigNumber } = ethers;
const _ = require("lodash");

class RuntimeError extends Error {
  constructor(message, exitStatus) {
    super(message);
    this.name = "RuntimeError";
    this.exitStatus = exitStatus;
  }
}

const NETWORK_NAME = network.name.toUpperCase();

program.requiredOption("-p, --pools <string...>", "APY stablecoin pool type");
program.requiredOption("-a, --amounts <string...>", "funding amounts in wei");

async function main(options) {
  const symbols = options.pools;
  const amounts = options.amounts;
  const result = await fundAccount(symbols, amounts);
  return result.toString();
}

async function fundAccount(symbols, amounts) {
  if (symbols.length != amounts.length) {
    throw new RuntimeError("Must include amount for each symbol.");
  }
  const addressRegistry = await getAddressRegistry(NETWORK_NAME);
  const poolManagerAddress = await addressRegistry.poolManagerAddress();
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress
  );

  let poolAmounts = _.zip(symbols, amounts).map(([symbol, amount]) => {
    return {
      poolId: getPoolId(symbol),
      amount: BigNumber.from(amount),
    };
  });
  poolAmounts = _.filter(poolAmounts, (p) => p.amount.gt("0"));

  try {
    const trx = await poolManager.fundLpSafe(poolAmounts);
    await trx.wait();
  } catch (error) {
    console.log(error);
  }

  // unset manual override for zero TVL (if needed)
  try {
    const oracleAdapterAddress = await addressRegistry.oracleAdapterAddress();
    const oracleAdapter = await ethers.getContractAt(
      "OracleAdapter",
      oracleAdapterAddress
    );
    await oracleAdapter.lock();
    await oracleAdapter.setTvl(1, 0);
    await oracleAdapter.unlock();
  } catch (error) {
    console.log(error);
  }
}

const getPoolId = (symbol) => bytes32(`${symbol.toLowerCase()}Pool`);

if (!module.parent) {
  program.parse(process.argv);
  const options = program.opts();
  main(options)
    .then((result) => {
      if (!(typeof result === "string" || result instanceof Buffer)) {
        process.exit(1);
      }
      process.stdout.write(result);
      process.exit(0);
    })
    .catch((error) => {
      const exitStatus = error.exitStatus || 1;
      process.exit(exitStatus);
    });
} else {
  // if importing in another script
  module.exports = fundAccount;
}
