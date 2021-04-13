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
const CurveABI = require("../abi/curveDaoERC20");
// const LiquidityGauge3Pool = require("../abi/liquidityGauge3Pool")
const {
  getStrategyAccountInfo,
  getTvlManager,
  getAddressRegistry,
} = require("./utils");
const { bytes32 } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const tvlManager = await getTvlManager(networkName);

  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
  const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
  const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

  const [, accountAddress] = await getStrategyAccountInfo(networkName);

  const addressRegistry = await getAddressRegistry(networkName);
  const curvePeripheryAddress = await addressRegistry.getAddress(
    bytes32("curvePeriphery")
  );

  console.log("");
  console.log("Register 3pool allocations for strategy account ...");
  console.log("");

  const CurvePeriphery = await ethers.getContractFactory("CurvePeriphery");

  const calldataForDai = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      accountAddress,
      STABLE_SWAP_ADDRESS,
      LIQUIDITY_GAUGE_ADDRESS,
      LP_TOKEN_ADDRESS,
      0,
    ]
  );
  const calldataForUsdc = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      accountAddress,
      STABLE_SWAP_ADDRESS,
      LIQUIDITY_GAUGE_ADDRESS,
      LP_TOKEN_ADDRESS,
      1,
    ]
  );
  const calldataForUsdt = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      accountAddress,
      STABLE_SWAP_ADDRESS,
      LIQUIDITY_GAUGE_ADDRESS,
      LP_TOKEN_ADDRESS,
      2,
    ]
  );

  const curveERC20 = await ethers.getContractAt(
    CurveABI,
    "0xD533a949740bb3306d119CC777fa900bA034cd52",
    deployer
  );
  const calldataForCRV = curveERC20.interface.encodeFunctionData(
    "balanceOf(address)",
    [accountAddress]
  );

  // const liquidityGauge3Pool = await ethers.getContractAt(
  //   LiquidityGauge3Pool,
  //   '0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A',
  //   deployer
  // )

  let data = [curvePeripheryAddress, calldataForDai];
  let trx = await tvlManager.addAssetAllocation(data, "DAI", 18);
  await trx.wait();
  let allocationId = await tvlManager.generateDataHash(data);
  console.log("DAI Allocation ID:", allocationId);

  data = [curvePeripheryAddress, calldataForUsdc];
  trx = await tvlManager.addAssetAllocation(data, "USDC", 6);
  await trx.wait();
  allocationId = await tvlManager.generateDataHash(data);
  console.log("USDC Allocation ID:", allocationId);

  data = [curvePeripheryAddress, calldataForUsdt];
  trx = await tvlManager.addAssetAllocation(data, "USDT", 6);
  await trx.wait();
  allocationId = await tvlManager.generateDataHash(data);
  console.log("USDT Allocation ID:", allocationId);

  data = [curveERC20.address, calldataForCRV];
  trx = await tvlManager.addAssetAllocation(data, "CRV", 18);
  await trx.wait();
  allocationId = await tvlManager.generateDataHash(data);
  console.log("CRV Allocation ID:", allocationId);

  console.log("... done.");
  console.log("");

  /****************************************/
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Registration successful.");
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
