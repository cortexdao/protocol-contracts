const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

const REWARD_DIST_ADDRESS = require(DEPLOYS_JSON["APYRewardDistributor"]);

task("claim", "Claim rewards using a signature")
  .addParam("nonce")
  .addParam("address")
  .addParam("amount")
  .addParam("v")
  .addParam("r")
  .addParam("s")
  .setAction(async taskArgs => {
    const NETWORK_NAME = network.name.toUpperCase();

    const RewardDistributor = await ethers.getContractFactory(
      "APYRewardDistributor"
    );
    const rewardDistributor = await RewardDistributor.attach(
      REWARD_DIST_ADDRESS[CHAIN_IDS[NETWORK_NAME]]
    );

    await rewardDistributor.claim(
      {
        nonce: taskArgs.nonce,
        wallet: taskArgs.address,
        amount: taskArgs.amount
      },
      parseInt(taskArgs.v),
      ethers.utils.hexlify(taskArgs.r),
      ethers.utils.hexlify(taskArgs.s)
    );
    console.log("Claimed rewards");
  });
