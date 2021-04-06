#!/usr/bin/env node
const hre = require("hardhat");
const { network } = hre;

const { program } = require("commander");

const { getApyPool } = require("./utils");

const NETWORK_NAME = network.name.toUpperCase();

program.requiredOption("-p, --pool <string>", "APY stablecoin pool type");

async function main(options) {
  const symbol = options.pool.toUpperCase();
  if (!["DAI", "USDC", "USDT"].includes(symbol))
    throw new Error(`'pool' parameter not recognized: ${symbol}`);

  const pool = await getApyPool(NETWORK_NAME, symbol);
  const topUpValue = await pool.getReserveTopUpValue();
  let amount = await pool.getUnderlyerAmountFromValue(Math.abs(topUpValue));
  if (topUpValue.lt(0)) {
    amount = amount.mul(-1);
  }
  return amount.toString();
}

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
    .catch(() => {
      process.exit(1);
    });
} else {
  module.exports = main;
}
