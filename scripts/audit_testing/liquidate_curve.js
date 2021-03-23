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
const { ethers, network, artifacts } = hre;
const {
  getAccountManager,
  getStrategyAccountInfo,
  getStablecoins,
} = require("./utils");
const { console } = require("./utils");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const accountManager = await getAccountManager(networkName);
  console.logAddress("AccountManager", accountManager.address);

  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);
  console.logAddress("Strategy account", accountAddress);

  const stablecoins = await getStablecoins(networkName);

  console.log("");
  console.log("Executing ...");
  console.log("");

  const ifaceStableSwap = new ethers.utils.Interface(
    artifacts.require("IStableSwap").abi
  );
  const ifaceLiquidityGauge = new ethers.utils.Interface(
    artifacts.require("ILiquidityGauge").abi
  );

  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
  const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
  const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

  // stake LP tokens in the gauge
  const gauge = await ethers.getContractAt(
    "IDetailedERC20",
    LIQUIDITY_GAUGE_ADDRESS
  );
  let gaugeBalance = await gauge.balanceOf(accountAddress);
  console.log("Gauge balance (before):", gaugeBalance.toString());
  const liquidityGaugeWithdraw = ifaceLiquidityGauge.encodeFunctionData(
    "withdraw(uint256)",
    [gaugeBalance]
  );
  let executionSteps = [[LIQUIDITY_GAUGE_ADDRESS, liquidityGaugeWithdraw]];
  await accountManager.execute(accountId, executionSteps, []);

  gaugeBalance = await gauge.balanceOf(accountAddress);
  console.log("Gauge balance (after):", gaugeBalance.toString());

  // deposit into liquidity pool
  const lpToken = await ethers.getContractAt(
    "IDetailedERC20",
    LP_TOKEN_ADDRESS
  );
  let lpBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP balance (before):", lpBalance.toString());
  const stableSwapRemoveLiquidity = ifaceStableSwap.encodeFunctionData(
    "remove_liquidity(uint256,uint256[3])",
    [lpBalance, [0, 0, 0]]
  );

  executionSteps = [
    [STABLE_SWAP_ADDRESS, stableSwapRemoveLiquidity], // deposit DAI into Curve 3pool
  ];
  await accountManager.execute(accountId, executionSteps, []);

  lpBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP balance (after):", lpBalance.toString());

  const daiToken = stablecoins["DAI"];
  const daiBalance = await daiToken.balanceOf(accountAddress);
  console.log("DAI balance:", daiBalance.toString());

  console.logDone();

  /****************************************/
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Execution successful.");
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
