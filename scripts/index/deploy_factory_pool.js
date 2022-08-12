#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs").option("compile", {
  type: "boolean",
  default: true,
  description: "Compile contract using `compile:one`",
});
const hre = require("hardhat");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  MAX_UINT256,
} = require("../../utils/helpers");
const { ethers } = hre;
const fs = require("fs");

const V2_FACTORY_ADDRESS = "0xF18056Bbd320E96A48e3Fbf8bC061322531aac99";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_WHALE_ADDRESS = "0x0a59649758aa4d66e25f08dd01271e891fe52199"; // Maker PSM

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const [deployer, alice] = await ethers.getSigners();

  const blob = fs.readFileSync("./scripts/index/abis/Factory.json");
  const factoryAbi = JSON.parse(blob);
  const factory = await ethers.getContractAt(factoryAbi, V2_FACTORY_ADDRESS);

  const usdc = await ethers.getContractAt("IDetailedERC20", USDC_ADDRESS);
  const usdcWhale = await impersonateAccount(USDC_WHALE_ADDRESS, 100);

  // // Grab the previously deployed index token address, assuming
  // // nonce should be decremented twice to account for index token deploy and initialize.
  // // Expected to be: 0x82E4bb17a00B32e5672d5EBe122Cd45bEEfD32b3
  // // If not, adjust this accordingly.
  // const indexTokenAddress = ethers.utils.getContractAddress({
  //   from: deployer.address,
  //   nonce: nonce - 2,
  // });
  const indexTokenAddress = "0x82E4bb17a00B32e5672d5EBe122Cd45bEEfD32b3";
  const indexToken = await ethers.getContractAt(
    "IndexToken",
    indexTokenAddress
  );
  console.log("Index token: %s", indexTokenAddress);

  /*
  Recommended params from the Curve Factory UI

  conversions to go from UI units to EVM
  
  A
  - no adjustment needed
  gamma:
  - multiply by 10 ** 18
  mid and out fees
  - multiply by 10 ** 8  (1bps = 10**6)
  allowed_extra_profit
  - multiply by 10 ** 18
  fee gamma:
  - multiply by 10 ** 18
  adjustment step
  - multiply by 10 ** 18
  admin fee
  - multiply by 10 ** 16
  ma half time
  - no adjustment needed
  initial price  <-- is displayed in UI as reciprocal of actual value
  - multiply by 10 ** 18
  */
  const A = 400000;
  const gamma = tokenAmountToBigNumber("0.000145", 18);
  const mid_fee = tokenAmountToBigNumber("0.26", 8);
  const out_fee = tokenAmountToBigNumber("0.45", 8);
  const allowed_extra_profit = tokenAmountToBigNumber("0.000002", 18);
  const fee_gamma = tokenAmountToBigNumber("0.00023", 18);
  const adjustment_step = tokenAmountToBigNumber("0.000146", 18);
  const admin_fee = tokenAmountToBigNumber("50", 16);
  const ma_half_time = 600;

  const market_price = 1;
  const initial_price = tokenAmountToBigNumber(market_price, 18);
  const name = "APY/ETH";
  const symbol = "APYETH";
  const coins = [USDC_ADDRESS, indexTokenAddress];
  const tx = await factory
    .connect(deployer)
    .deploy_pool(
      name,
      symbol,
      coins,
      A,
      gamma,
      mid_fee,
      out_fee,
      allowed_extra_profit,
      fee_gamma,
      adjustment_step,
      admin_fee,
      ma_half_time,
      initial_price
    );
  await tx.wait();
  const poolCount = await factory.pool_count();
  const poolAddress = await factory.pool_list(poolCount.sub(1));
  console.log("Pool address: %s", poolAddress);

  const swapBlob = fs.readFileSync(
    "./scripts/index/abis/CurveCryptoSwap2ETH.json"
  );
  const swapAbi = JSON.parse(swapBlob);
  const pool = await ethers.getContractAt(swapAbi, poolAddress);

  const prices = [tokenAmountToBigNumber(1, 6), initial_price]; // price using first token as quote ccy
  const addLiquidityAmount = 1000000n;
  const quantities = prices.map((p) => p.mul(addLiquidityAmount));

  await usdc.connect(usdcWhale).transfer(alice.address, quantities[0]);
  await usdc.connect(alice).approve(pool.address, MAX_UINT256);
  await indexToken.connect(alice).approve(pool.address, MAX_UINT256);

  // seed the pool with our liquidity
  await pool.connect(alice)["add_liquidity(uint256[2],uint256)"](quantities, 0);

  console.log("Pool balances:");
  console.log("  USDC: %s", quantities[0] / 10 ** 6);
  console.log("  idxCVX: %s", quantities[1] / 10 ** 18);
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Factory pool deployed.");
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
