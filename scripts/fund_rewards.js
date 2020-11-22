const {
  CHAIN_IDS,
  DEPLOYS_JSON
} = require("../utils/constants.js");

const TOKEN_ADDRESS = require(DEPLOYS_JSON["APYGovernanceTokenProxy"]);
const REWARD_DIST_ADDRESS = require(DEPLOYS_JSON["APYRewardDistributor"]);

task("fund", "Fund the rewards distributor")
  .addParam("amount")
  .setAction(async taskArgs => {
    const NETWORK_NAME = network.name.toUpperCase();
    console.log(`${NETWORK_NAME} selected`);

    const signers = await ethers.getSigners();
    const fundingAddress = await signers[0].getAddress();

    const APYGovernanceToken = await ethers.getContractFactory(
      "APYGovernanceToken"
    );

    const token = await APYGovernanceToken.attach(TOKEN_ADDRESS[CHAIN_IDS[NETWORK_NAME]]);

    const rewardDistributorAddress = REWARD_DIST_ADDRESS[CHAIN_IDS[NETWORK_NAME]];

    const amount = "100";
    await token.transfer(
      rewardDistributorAddress,
      ethers.utils.parseEther(amount)
    );
    console.log(`Transferred ${amount} tokens to ${rewardDistributorAddress}`);
  });
