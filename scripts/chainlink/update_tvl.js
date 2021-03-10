#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.  Values are passed like so:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js --arg1=val1 --arg2=val2
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ MNEMONIC='' yarn fork:mainnet
 */
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

// 3Pool addresses:
const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A"; // eslint-disable-line no-unused-vars

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

  const amounts = [];
  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const tokenAddress = getStablecoinAddress(symbol, "MAINNET");
    const token = await ethers.getContractAt("IDetailedERC20", tokenAddress);
    stablecoins[symbol] = token;

    const decimals = await token.decimals();
    const minBalance = tokenAmountToBigNumber("1000", decimals);
    const fundingAmount = tokenAmountToBigNumber("10000", decimals);

    // replenish strategy account with coins if running low
    const balance = await token.balanceOf(strategy.address);
    if (balance.lt(minBalance)) {
      const sender = STABLECOIN_POOLS[symbol];
      await acquireToken(sender, strategy, token, fundingAmount, deployer);
    }

    // ensure there is enough to deposit, i.e.
    // amount <= minBalance
    amounts.push(tokenAmountToBigNumber("333", decimals));
  }

  const stableSwap = await ethers.getContractAt(
    "IStableSwap",
    STABLE_SWAP_ADDRESS
  );
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const token = stablecoins[symbol];
    const allowance = await token.allowance(
      strategy.address,
      stableSwap.address
    );
    // Tether doesn't like repeated approvals
    if (allowance.eq(MAX_UINT256)) continue;
    await stablecoins[symbol]
      .connect(strategy)
      .approve(stableSwap.address, MAX_UINT256);
  }

  await stableSwap.connect(strategy).add_liquidity(amounts, 0);

  const lpToken = await ethers.getContractAt(
    "IDetailedERC20",
    LP_TOKEN_ADDRESS
  );
  const totalLPBalance = await lpToken.balanceOf(strategy.address);

  /******************************************************/
  /* use this if you want to earn CRV through the gauge */
  /******************************************************/
  // const gauge = await ethers.getContractAt(
  //   "ILiquidityGauge",
  //   LIQUIDITY_GAUGE_ADDRESS
  // );
  // /* split LP tokens between strategy and gauge */
  // const strategyLpBalance = totalLPBalance.div(3);
  // const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
  // await lpToken.connect(strategy).approve(gauge.address, MAX_UINT256);
  // await gauge.connect(strategy)["deposit(uint256)"](gaugeLpBalance);

  const lpTotalSupply = await lpToken.totalSupply();
  for (const [idx, symbol] of [
    [0, "DAI"],
    [1, "USDC"],
    [2, "USDT"],
  ]) {
    const poolBalance = await stableSwap.balances(idx);
    console.log(`Pool balance (${symbol}):`, poolBalance.toString());

    const expectedBalance = totalLPBalance.mul(poolBalance).div(lpTotalSupply);
    console.log(
      `Expected user balance (${symbol}):`,
      expectedBalance.toString()
    );
    console.log("");
  }
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
