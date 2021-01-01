/* eslint-disable no-console */
const hre = require("hardhat");
const { argv } = require("yargs");
const demoUpgrades = require("./alpha_demo_upgrades");
const demoRebalance = require("./alpha_demo_rebalance");
const demoCurve = require("./alpha_demo_curve");

async function main(argv) {
  await hre.run("compile");
  await demoUpgrades(argv);
  await demoRebalance(argv);
  await demoCurve(argv);
}

main(argv)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
