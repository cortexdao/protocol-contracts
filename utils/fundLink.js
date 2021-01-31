const hre = require("hardhat");
const { ethers } = hre;
const { argv } = require("yargs");
const { acquireToken, console } = require("./helpers");

console.debugging = true;

const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
const WHALE_ADDRESS = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3";

async function main(argv) {
  await hre.run("compile");
  console.log("Acquire LINK for testing ...");
  const token = await ethers.getContractAt("IDetailedERC20", LINK_ADDRESS);

  const testAccountIndex = argv.accountIndex || 0;
  console.log("Account index:", testAccountIndex);
  const signers = await ethers.getSigners();
  const tester = await signers[testAccountIndex].getAddress();
  console.log("Recipient address:", tester);

  const amount = argv.amount || "100000";
  console.log("Amount:", amount);

  // Aave lending pool
  // https://etherscan.io/address/0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3
  const sender = WHALE_ADDRESS;
  await acquireToken(sender, tester, token, amount, tester);
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
