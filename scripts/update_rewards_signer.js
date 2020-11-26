require("dotenv").config();
const assert = require("assert");
const { ethers, network } = require("@nomiclabs/buidler");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

const DISTRIBUTOR_ADDRESS = require(DEPLOYS_JSON["APYRewardDistributor"]);

/* **************************************************
 *** increment address index to get new key ********
 ************************************************* */
const addressIndex = 0;
/* *********************************************** */

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);

  const RewardDistributor = await ethers.getContractFactory(
    "APYRewardDistributor"
  );

  const contractAddress = DISTRIBUTOR_ADDRESS[CHAIN_IDS[NETWORK_NAME]];
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

  const transaction = await rewardDistributor.setSigner(signerAddress);
  const receipt = await transaction.wait();
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${receipt.transactionHash}`
  );
}

main()
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
