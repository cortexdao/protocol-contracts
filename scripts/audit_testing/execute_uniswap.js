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
  const ifaceUniswapRouter = new ethers.utils.Interface(
    artifacts.require("IUniswapV2Router").abi
  );

  const UNISWAP_V2_ROUTER_ADDRESS =
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  // USDC-USDT pair
  const LP_TOKEN_ADDRESS = "0x3041cbd36888becc7bbcbc0045e3b1f144466f5f";

  // deposit into liquidity pool
  const usdcToken = stablecoins["USDC"];
  const usdtToken = stablecoins["USDT"];
  const usdcAmount = tokenAmountToBigNumber("1000", "6");
  const usdtAmount = tokenAmountToBigNumber("1000", "6");

  const lpToken = await ethers.getContractAt(
    "IDetailedERC20",
    LP_TOKEN_ADDRESS
  );
  let lpTokenBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP token balance (before):", lpTokenBalance.toString());

  const approveRouter = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [UNISWAP_V2_ROUTER_ADDRESS, MAX_UINT256]
  );
  const uniswapAddLiquidity = ifaceUniswapRouter.encodeFunctionData(
    "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
    [
      usdcToken.address,
      usdtToken.address,
      usdcAmount,
      usdtAmount,
      1,
      1,
      accountAddress,
      MAX_UINT256,
    ]
  );

  let executionSteps = [
    [usdcToken.address, approveRouter],
    [usdtToken.address, approveRouter],
    [UNISWAP_V2_ROUTER_ADDRESS, uniswapAddLiquidity],
  ];
  await accountManager.execute(accountId, executionSteps, []);

  lpTokenBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP token balance (after):", lpTokenBalance.toString());

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
