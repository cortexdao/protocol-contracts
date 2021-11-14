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
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  waitForSafeTxDetails,
  getDeployedAddress,
  getSafeSigner,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  if (!["KOVAN", "MAINNET"].includes(networkName)) return;

  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const owner = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", owner.address);
  console.log("");

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const safeSigner = await getSafeSigner(adminSafeAddress, owner, networkName);

  console.log("Deploying ...");
  const LpAccountTempStorageFix = await ethers.getContractFactory(
    "LpAccountTempStorageFix"
  );

  const lpAccount = await LpAccountTempStorageFix.connect(safeSigner).deploy();
  const receipt = await waitForSafeTxDetails(
    lpAccount.deployTransaction,
    safeSigner.service
  );

  console.log("Deployed.");
  console.log("Address: %s", receipt.contractAddress);
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
