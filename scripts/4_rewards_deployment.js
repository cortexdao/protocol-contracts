require("dotenv").config();
const { ethers, network } = require("hardhat");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants");
const { updateDeployJsons } = require("../utils/helpers");

const TOKEN_ADDRESS = require(DEPLOYS_JSON["GovernanceTokenProxy"]);

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);

  const RewardDistributor = await ethers.getContractFactory(
    "RewardDistributor"
  );

  const SIGNER_MNEMONIC = process.env.SIGNER_MNEMONIC;
  const wallet = ethers.Wallet.fromMnemonic(SIGNER_MNEMONIC);
  const signerAddress = wallet.address;
  console.log("Signer address:", signerAddress);
  console.log("Private key:", wallet.privateKey);

  const rewardDistributor = await RewardDistributor.deploy(
    TOKEN_ADDRESS[CHAIN_IDS[NETWORK_NAME]],
    signerAddress
  );
  await rewardDistributor.deployed();

  const deploy_data = {};
  deploy_data["RewardDistributor"] = rewardDistributor.address;
  console.log(`RewardDistributor: ${rewardDistributor.address}`);
  await updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
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
