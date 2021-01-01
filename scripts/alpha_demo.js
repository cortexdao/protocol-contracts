/* eslint-disable no-console */
const hre = require("hardhat");
const { argv } = require("yargs");
const demoUpgrades = require("./alpha_demo_upgrades");
const demoDeployStrategy = require("./alpha_demo_deploy_strategy");
const demoCurve = require("./alpha_demo_curve");

async function main(argv) {
  await hre.run("compile");
  await demoUpgrades(argv);
  await demoDeployStrategy(argv);
  // await demoCurve(argv);
}

main(argv)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
