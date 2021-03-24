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
const { getAccountManager, getStrategyAccountInfo } = require("./utils");
const { console } = require("./utils");
const { MAX_UINT256 } = require("../../utils/helpers");

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

  // withdraw from liquidity pool

  const lpToken = await ethers.getContractAt(
    "IUniswapV2Pair",
    LP_TOKEN_ADDRESS
  );
  let lpTokenBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP token balance (before):", lpTokenBalance.toString());

  const approveRouter = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [UNISWAP_V2_ROUTER_ADDRESS, MAX_UINT256]
  );

  const token0 = await lpToken.token0();
  const token1 = await lpToken.token1();
  const uniswapRemoveLiquidity = ifaceUniswapRouter.encodeFunctionData(
    "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
    [token0, token1, lpTokenBalance, 1, 1, accountAddress, MAX_UINT256]
  );

  let executionSteps = [
    [LP_TOKEN_ADDRESS, approveRouter],
    [UNISWAP_V2_ROUTER_ADDRESS, uniswapRemoveLiquidity],
  ];
  await accountManager.execute(accountId, executionSteps, []);

  lpTokenBalance = await lpToken.balanceOf(accountAddress);
  console.log("LP token balance (after):", lpTokenBalance.toString());

  console.logDone();
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
