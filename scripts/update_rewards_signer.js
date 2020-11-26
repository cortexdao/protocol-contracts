require("dotenv").config();
const { ethers, network } = require("@nomiclabs/buidler");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

const TOKEN_ADDRESS = require(DEPLOYS_JSON["APYGovernanceTokenProxy"]);

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

  // increment address index to get new path
  const addressIndex = 1;
  const path = "m/44'/60'/0'/0/" + addressIndex.toString();
  const SIGNER_MNEMONIC = process.env.SIGNER_MNEMONIC;
  const wallet = ethers.Wallet.fromMnemonic(SIGNER_MNEMONIC, path);
  const signerAddress = wallet.address;
  console.log("Signer address:", signerAddress);
  console.log("Private key:", wallet.privateKey);

  const rewardDistributor = await RewardDistributor.attach(
    TOKEN_ADDRESS[CHAIN_IDS[NETWORK_NAME]]
  );
  const transaction = await rewardDistributor.setSigner(signerAddress);
  const receipt = await transaction.wait();
  console.log("Transaction hash:", receipt.transactionHash);
}

main()
  .then(() => {
    console.log("Set new signer successfully.");
    console.log("");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    console.log("");
    process.exit(1);
  });
