const hre = require("hardhat");
const { ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;

const { acquireToken } = require("./token");

const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
// Aave lending pool
// https://etherscan.io/address/0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3
const WHALE_ADDRESS = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3";

async function deployAggregator(
  aggConfig,
  oracleAddress,
  oracleOwnerAddress,
  ethFunderAddress
) {
  /*
  Example of an aggConfig:
    const tvlAggConfig = {
      paymentAmount: tokenAmountToBigNumber("1", "18"), // payment amount (price paid for each oracle submission, in wei)
      minSubmissionValue: 0,
      maxSubmissionValue: tokenAmountToBigNumber("1", "20"),
      decimals: 8, // decimal offset for answer
      description: "TVL aggregator",
    };
  */
  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");
  const agg = await FluxAggregator.deploy(
    LINK_ADDRESS,
    aggConfig.paymentAmount, // payment amount (price paid for each oracle submission, in wei)
    100000, // timeout before allowing oracle to skip round
    ZERO_ADDRESS, // validator address
    aggConfig.minSubmissionValue,
    aggConfig.maxSubmissionValue,
    aggConfig.decimals,
    aggConfig.description
  );
  await agg.deployed();

  // fund agg with LINK
  // aggregator must hold enough LINK for two rounds of submissions, i.e.
  // LINK reserve >= 2 * number of oracles * payment amount
  const linkToken = await ethers.getContractAt("IDetailedERC20", LINK_ADDRESS);
  const linkAmount = "100000";
  await acquireToken(
    WHALE_ADDRESS,
    agg.address,
    linkToken,
    linkAmount,
    ethFunderAddress
  );
  let trx = await agg.updateAvailableFunds();
  await trx.wait();

  // register oracle "node" with aggs
  trx = await agg.changeOracles(
    [], // oracles being removed
    [oracleAddress], // oracles being added
    [oracleOwnerAddress], // owners of oracles being added
    1, // min number of submissions for a round
    1, // max number of submissions for a round
    0 // number of rounds to wait before oracle can initiate round
  );
  await trx.wait();

  return agg;
}

module.exports = {
  deployAggregator,
};
