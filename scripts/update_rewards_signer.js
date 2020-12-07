require("dotenv").config();
const assert = require("assert");
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

const DISTRIBUTOR_ADDRESS = require(DEPLOYS_JSON["APYRewardDistributor"]);

/* **************************************************
 *** increment address index to get new key ********
 ************************************************* */
const addressIndex = 0;
/* *********************************************** */

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  const chainId = CHAIN_IDS[NETWORK_NAME];

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);

  const RewardDistributor = await ethers.getContractFactory(
    "APYRewardDistributor"
  );

  const contractAddress = DISTRIBUTOR_ADDRESS[chainId];
  const rewardDistributor = await RewardDistributor.attach(contractAddress);
  console.log("Contract address:", contractAddress);

  assert.strictEqual(
    await rewardDistributor.owner(),
    deployer,
    "Deployer must be owner."
  );
  console.log("Old signer address:", await rewardDistributor["signer()"]());
  console.log("");

  const path = "m/44'/60'/0'/0/" + addressIndex.toString();
  console.log("New key derivation path:", path);
  const SIGNER_MNEMONIC = process.env.SIGNER_MNEMONIC;
  const wallet = ethers.Wallet.fromMnemonic(SIGNER_MNEMONIC, path);
  const signerAddress = wallet.address;
  console.log("New signer address:", signerAddress);
  console.log("New private key:", wallet.privateKey);
  console.log("");

  if (argv.dryRun) {
    console.log("");
    console.log("Doing a dry run ...");
    const gasEstimate = await rewardDistributor.estimateGas.setSigner(
      signerAddress
    );
    console.log("Gas estimate:", gasEstimate.toString());
    console.log("");
  } else {
    const transaction = await rewardDistributor.setSigner(signerAddress);
    const receipt = await transaction.wait();
    console.log(
      "Etherscan:",
      `https://etherscan.io/tx/${receipt.transactionHash}`
    );
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Set new signer successfully.");
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
