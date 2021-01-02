/* eslint-disable no-console */
const hre = require("hardhat");
const { argv } = require("yargs");
const { BigNumber } = require("ethers");
const demoUpgrades = require("./alpha_demo_upgrades");
const demoDeployStrategy = require("./alpha_demo_deploy_strategy");
const demoCurve = require("./alpha_demo_curve");
const demoDodo = require("./alpha_demo_dodo");
const demoMith = require("./alpha_demo_mith");
const BALANCE_PROPORTION_ENTRIES = require("../config/alpha_demo.json");
const { console } = require("../utils/helpers");

console.debugging = true;

const STRATEGY_TO_SCRIPT = {
  cDAI_cUSDC_cUSDT: [demoCurve, { pool: "cDAI_cUSDC_cUSDT" }],
  cDAI_cUSDC: [demoCurve, { pool: "cDAI_cUSDC" }],
  yDAI_yUSDC_yUSDT_yTUSD: [demoCurve, { pool: "yDAI_yUSDC_yUSDT_yTUSD" }],
  DODO: [demoDodo, {}],
  MITH: [demoMith, {}],
};

function processBalanceProportions(balanceProportionEntries, stableSymbols) {
  const symbolToStrategyPercentages = {};
  for (const symbol of stableSymbols) {
    const total = balanceProportionEntries.reduce(
      (runningTotal, entry) => runningTotal + (entry[symbol] || 0),
      0
    );
    const strategyToFraction = {};
    for (const entry of balanceProportionEntries) {
      const proportion = entry[symbol] || 0;
      strategyToFraction[entry.strategy] = [proportion, total];
    }
    symbolToStrategyPercentages[symbol] = strategyToFraction;
  }
  return symbolToStrategyPercentages;
}

async function main(argv) {
  await hre.run("compile");

  await demoUpgrades(argv);
  const stablecoinBalances = await demoDeployStrategy(argv);
  console.debug(stablecoinBalances);

  const stableSymbols = Object.keys(stablecoinBalances);
  const symbolToStrategyPercentages = processBalanceProportions(
    BALANCE_PROPORTION_ENTRIES,
    stableSymbols
  );
  console.debug(symbolToStrategyPercentages);

  for (const strategy of Object.keys(STRATEGY_TO_SCRIPT)) {
    const [script, scriptArgv] = STRATEGY_TO_SCRIPT[strategy];
    for (const symbol of stableSymbols) {
      symbolToStrategyPercentages[symbol];
      const strategyToPercentages = symbolToStrategyPercentages[symbol];
      const totalBalance = stablecoinBalances[symbol];
      const [proportion, total] = strategyToPercentages[strategy];
      const balance = BigNumber.from(totalBalance)
        .mul(proportion)
        .div(total)
        .toString();
      const argName = symbol.toLowerCase() + "Bal";
      scriptArgv[argName] = balance;
    }
    console.debug(`${strategy} scriptArgv:`, scriptArgv);
    await script(scriptArgv);
  }
}

main(argv)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
