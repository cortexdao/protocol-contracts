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
  const ifaceLendingPool = new ethers.utils.Interface(
    artifacts.require("IAaveLendingPool").abi
  );

  // Aave interest-bearing DAI token
  const ADAI_ADDRESS = "0x028171bCA77440897B824Ca71D1c56caC55b68A3";
  const AAVE_LENDING_POOL_ADDRESS =
    "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

  // deposit into liquidity pool
  const daiToken = stablecoins["DAI"];
  const daiAmount = tokenAmountToBigNumber("1000", "18");

  const aDaiToken = await ethers.getContractAt("IDetailedERC20", ADAI_ADDRESS);
  let aDaiBalance = await aDaiToken.balanceOf(accountAddress);
  console.log("aDAI balance (before):", aDaiBalance.toString());
  const approveLendingPool = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [AAVE_LENDING_POOL_ADDRESS, MAX_UINT256]
  );
  const lendingPoolDeposit = ifaceLendingPool.encodeFunctionData(
    "deposit(address,uint256,address,uint16)",
    [daiToken.address, daiAmount, accountAddress, 0]
  );

  let executionSteps = [
    [daiToken.address, approveLendingPool], // approve lending pool for DAI
    [AAVE_LENDING_POOL_ADDRESS, lendingPoolDeposit], // deposit DAI into Aave lending pool
  ];
  await accountManager.execute(accountId, executionSteps, []);

  aDaiBalance = await aDaiToken.balanceOf(accountAddress);
  console.log("aDAI balance (after):", aDaiBalance.toString());

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
