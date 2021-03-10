/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  tokenAmountToBigNumber,
  MAX_UINT256,
  getStablecoinAddress,
  acquireToken,
} = require("../../utils/helpers");
const { STABLECOIN_POOLS } = require("../../utils/constants");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer, strategy] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  const daiAddress = getStablecoinAddress("DAI", "MAINNET");
  const daiToken = await ethers.getContractAt("IDetailedERC20", daiAddress);

  const decimals = await daiToken.decimals();
  const amount = tokenAmountToBigNumber("10000", decimals);
  const sender = STABLECOIN_POOLS["DAI"];
  await acquireToken(sender, strategy, daiToken, amount, deployer);

  // split LP tokens between strategy and gauge
  // const totalLPBalance = await lpToken.balanceOf(strategy.address);
  // const strategyLpBalance = totalLPBalance.div(3);
  // const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
  // expect(gaugeLpBalance).to.be.gt(0);
  // expect(strategyLpBalance).to.be.gt(0);

  const daiIndex = 0;

  // const poolBalance = await stableSwap.balances(daiIndex);
  // const lpTotalSupply = await lpToken.totalSupply();

  // const expectedBalance = totalLPBalance.mul(poolBalance).div(lpTotalSupply);
  // expect(expectedBalance).to.be.gt(0);

  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";

  const daiAmount = tokenAmountToBigNumber("1000", 18);
  const minAmount = 0;

  const stableSwap = await ethers.getContractAt(
    "IStableSwap",
    STABLE_SWAP_ADDRESS
  );
  // use sequence
  await daiToken.connect(strategy).approve(stableSwap.address, MAX_UINT256);
  await stableSwap
    .connect(strategy)
    .add_liquidity([daiAmount, "0", "0"], minAmount);

  // // use this if you want to earn CRV through the gauge
  // const gauge = await ethers.getContractAt(
  //   "ILiquidityGauge",
  //   LIQUIDITY_GAUGE_ADDRESS
  // );
  // const lpToken = await ethers.getContractAt(
  //   "IDetailedERC20",
  //   LP_TOKEN_ADDRESS
  // );
  // await lpToken.connect(strategy).approve(gauge.address, MAX_UINT256);
  // await gauge.connect(strategy)["deposit(uint256)"](gaugeLpBalance);
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
