#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { tokenAmountToBigNumber, MAX_UINT256 } = require("../../utils/helpers");

const APY_ADDRESS = "0x63fd300bdf6eb55ee7bf7e38f54df8adf16dc8f5";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");
  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");

  const apyDeployer = ethers.Wallet.fromMnemonic(
    process.env.KOVAN_TOKEN_MNEMONIC
  ).connect(ethers.provider);
  const safeOwner = new ethers.Wallet(
    process.env.SAFE_OWNER_KEY,
    ethers.provider
  );
  console.log("APY token deployer:", apyDeployer.address);
  console.log("Safe owner:", safeOwner.address);

  const apy = await ethers.getContractAt("GovernanceToken", APY_ADDRESS);

  // transfer ETH to Safe owner
  let tx = await deployer.sendTransaction({
    to: safeOwner.address,
    value: tokenAmountToBigNumber("1"),
  });
  await tx.wait();

  // transfer APY to Safe owner
  tx = await apy
    .connect(apyDeployer)
    .transfer(safeOwner.address, tokenAmountToBigNumber("1000"));
  await tx.wait();

  // give infinite approval to blAPY contract
  const BLAPY_ADDRESS = "0x61b0414801205d4cc9843827b01cfc5dfe71dc42";
  tx = await apy.connect(safeOwner).approve(BLAPY_ADDRESS, MAX_UINT256);
  await tx.wait();
}

if (!module.parent) {
  main(argv)
    .then(() => {
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
