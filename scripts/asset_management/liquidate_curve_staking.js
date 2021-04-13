#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { program } = require("commander");

const { getAccountManager, getStrategyAccountInfo } = require("./utils");

// eslint-disable-next-line no-unused-vars
async function liquidateCurveStaking(gaugeAddress, gaugeAmount) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId] = await getStrategyAccountInfo(networkName);

  const ifaceLiquidityGauge = new ethers.utils.Interface(
    artifacts.require("ILiquidityGauge").abi
  );

  // stake LP tokens in the gauge
  const liquidityGaugeWithdraw = ifaceLiquidityGauge.encodeFunctionData(
    "withdraw(uint256)",
    [gaugeAmount]
  );
  let executionSteps = [[gaugeAddress, liquidityGaugeWithdraw]];
  await accountManager.execute(accountId, executionSteps, []);
}

async function main(options) {
  await liquidateCurveStaking(options.gaugeAddress, options.gaugeAmount);
}

if (!module.parent) {
  program.requiredOption(
    "-g, --gaugeAddress <string>",
    "gauge address",
    "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A"
  );
  program.requiredOption("-a, --gaugeAmount <string>", "gauge amount", 0);
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
  module.exports = liquidateCurveStaking;
}
