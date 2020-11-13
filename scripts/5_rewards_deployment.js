require("dotenv").config();
const { ethers, network } = require("@nomiclabs/buidler");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");
const { updateDeployJsons } = require("../utils/helpers.js");

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

  let deploy_data = {};

  const rewardDistributor = await RewardDistributor.deploy(
    TOKEN_ADDRESS[CHAIN_IDS[NETWORK_NAME]],
    deployer
  );
  await rewardDistributor.deployed();
  deploy_data["APYRewardDistributor"] = rewardDistributor.address;
  console.log(`APYRewardDistributor: ${rewardDistributor.address}`);

  await updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => {
    console.log("Deployment successful.");
    console.log("");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    console.log("");
    process.exit(1);
  });
