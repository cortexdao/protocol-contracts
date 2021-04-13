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
  getTvlManager,
  getStablecoins,
} = require("./utils");
const { console } = require("./utils");
const { MAX_UINT256 } = require("../../utils/helpers");
const { getAssetAllocationValue } = require("./get_assetallocation_value");
const { commify, formatUnits } = require("../../utils/helpers");

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

  const daiToken = stablecoins["DAI"];

  const tvlManager = await getTvlManager(networkName);

  const assetAlloId =
    "0x25dabd4989b405009f11566b2f49654e3b07db8da50c16d42fb2832e5cf3ce32";
  const balance = await tvlManager.balanceOf(assetAlloId);
  const symbol = await tvlManager.symbolOf(assetAlloId);
  const decimals = await tvlManager.decimalsOf(assetAlloId);

  const assetAllocations = [{ balance, symbol, decimals }];
  const value = await getAssetAllocationValue(assetAllocations);
  console.log(`Asset value: $${commify(formatUnits(value, 0))}`);

  const aDaiToken = await ethers.getContractAt("IDetailedERC20", ADAI_ADDRESS);
  let aDaiBalance = await aDaiToken.balanceOf(accountAddress);
  console.log("aDAI balance (before):", aDaiBalance.toString());

  //const amount = argv.amount || value;
  const amount = argv.amount || "3000000";
  const aDaiAmount = ethers.BigNumber.from(amount).mul(aDaiBalance).div(value);

  const approveLendingPool = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [AAVE_LENDING_POOL_ADDRESS, MAX_UINT256]
  );
  const lendingPoolWithdraw = ifaceLendingPool.encodeFunctionData(
    "withdraw(address,uint256,address)",
    [daiToken.address, aDaiAmount, accountAddress]
  );
  let executionSteps = [
    [ADAI_ADDRESS, approveLendingPool],
    [AAVE_LENDING_POOL_ADDRESS, lendingPoolWithdraw],
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
