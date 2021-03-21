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
const { tokenAmountToBigNumber, MAX_UINT256 } = require("../../utils/helpers");
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

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20").abi
  );
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

  // deposit into liquidity pool
  const approveStableSwap = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [STABLE_SWAP_ADDRESS, MAX_UINT256]
  );
  const daiAmount = tokenAmountToBigNumber("1000", "18");
  const stableSwapAddLiquidity = ifaceStableSwap.encodeFunctionData(
    "add_liquidity(uint256[3],uint256)",
    [[daiAmount, 0, 0], 0]
  );
  const daiToken = stablecoins["DAI"];

  let executionSteps = [
    [daiToken.address, approveStableSwap], // approve StableSwap for DAI
    [STABLE_SWAP_ADDRESS, stableSwapAddLiquidity], // deposit DAI into Curve 3pool
  ];
  await accountManager.execute(accountId, executionSteps, []);
  console.logDone();

  // stake LP tokens in the gauge
  const lpToken = await ethers.getContractAt(
    "IDetailedERC20",
    LP_TOKEN_ADDRESS
  );
  const lpBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP balance:", lpBalance.toString());

  const approveGauge = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [LIQUIDITY_GAUGE_ADDRESS, MAX_UINT256]
  );
  const liquidityGaugeDeposit = ifaceLiquidityGauge.encodeFunctionData(
    "deposit(uint256)",
    [lpBalance]
  );
  executionSteps = [
    [LP_TOKEN_ADDRESS, approveGauge], // approve LiquidityGauge for LP token
    [LIQUIDITY_GAUGE_ADDRESS, liquidityGaugeDeposit],
  ];
  await accountManager.execute(accountId, executionSteps, []);

  const gauge = await ethers.getContractAt(
    "IDetailedERC20",
    LIQUIDITY_GAUGE_ADDRESS
  );
  const gaugeBalance = await gauge.balanceOf(accountAddress);
  console.log("Gauge balance:", gaugeBalance.toString());

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
