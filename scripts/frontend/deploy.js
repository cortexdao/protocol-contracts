#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 *
 *
 * This script will deploy the stablecoin pools along with the mAPT token.
 */
const { argv } = require("yargs");
const deploy_agg = require("./deploy_agg");
const deploy_pools = require("./deploy_pools");

async function main(argv) {
  await deploy_agg(argv);
  await deploy_pools(argv);
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Deployment successful.");
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
