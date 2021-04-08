#!/usr/bin/env node
const hre = require("hardhat");
const { network } = hre;

const { program } = require("commander");

const { getApyPool } = require("./utils");

const NETWORK_NAME = network.name.toUpperCase();

class RuntimeError extends Error {
  constructor(message, exitStatus) {
    super(message);
    this.name = "RuntimeError";
    this.exitStatus = exitStatus || 1;
  }
}

program.requiredOption("-p, --pool <string>", "APY stablecoin pool type");
program.requiredOption("-m, --metric <string>", "metric name");

async function poolMetrics(symbol, metricName) {
  symbol = symbol.toLowerCase();
  if (!["dai", "usdc", "usdt"].includes(symbol))
    throw new RuntimeError(`'pool' parameter not recognized: ${symbol}`, 2);

  const pool = await getApyPool(NETWORK_NAME, symbol);

  let result;
  metricName = metricName.toLowerCase();
  switch (metricName) {
    case "total-value":
      result = await pool.getPoolTotalValue();
      break;
    case "deployed-value":
      result = await pool.getDeployedValue();
      break;
    case "underlyer-value":
      result = await pool.getPoolUnderlyerValue();
      break;
    case "topup-value":
      result = await pool.getReserveTopUpValue();
      break;
    case "topup":
    case "topup-amount":
      result = await getTopUpAmount(pool);
      break;
    default:
      throw new RuntimeError("Unrecognized metric name.", 3);
  }

  return result;
}

async function main(options) {
  const symbol = options.pool.toLowerCase();
  const metricName = options.metric.toLowerCase();
  const result = await poolMetrics(symbol, metricName);
  return result.toString();
}

async function getTopUpAmount(pool) {
  const topUpValue = await pool.getReserveTopUpValue();
  let amount = await pool.getUnderlyerAmountFromValue(topUpValue.abs());
  if (topUpValue.lt(0)) {
    amount = amount.mul(-1);
  }
  return amount;
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
    .catch((error) => {
      const exitStatus = error.exitStatus || 1;
      process.exit(exitStatus);
    });
} else {
  module.exports = poolMetrics;
}
