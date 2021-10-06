#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { network } = hre;

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  if (!["KOVAN", "MAINNET"].includes(networkName)) return;

  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  await hre.run("verify:verify", {
    address: "0x27010a52b24a8c6ee84216ae10437e3a9ad5924e",
  });
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Verification successful.");
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
