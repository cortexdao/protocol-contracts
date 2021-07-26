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
  bytes32,
  tokenAmountToBigNumber,
  MAX_UINT256,
} = require("../../utils/helpers");
const {
  console,
  getStrategyAccountInfo,
  getPoolManager,
  getAccountManager,
  getStablecoins,
} = require("./utils");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const [accountId] = await getStrategyAccountInfo(networkName);
  const accountManager = await getAccountManager(networkName);
  const poolManager = await getPoolManager(networkName);

  console.log("");
  console.log("Withdrawing from account to pools ...");
  console.log("");

  const stablecoins = await getStablecoins(networkName);

  const daiAmount = tokenAmountToBigNumber("990000", "18"); // 1MM DAI
  const usdcAmount = tokenAmountToBigNumber("4990000", "6"); // 5MM USDC

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20UpgradeSafe").abi
  );
  const approveManager = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [poolManager.address, MAX_UINT256]
  );
  const executionSteps = [
    [stablecoins["DAI"].address, approveManager],
    [stablecoins["USDC"].address, approveManager],
  ];

  await accountManager.execute(accountId, executionSteps, []);
  await poolManager.withdrawFromAccount(accountId, [
    {
      poolId: bytes32("daiPool"),
      amount: daiAmount,
    },
    {
      poolId: bytes32("usdcPool"),
      amount: usdcAmount,
    },
  ]);
  console.log("... done.");
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Pool funding successful.");
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
