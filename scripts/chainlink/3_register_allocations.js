#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { getDeployedAddress, bytes32 } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer, strategy] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  // const [funder] = await ethers.getSigners();
  // const fundingTrx = await funder.sendTransaction({
  //   to: mAptDeployer.address,
  //   value: ethers.utils.parseEther("1.0"),
  // });
  // await fundingTrx.wait();

  console.log("");
  console.log("Registering ...");
  console.log("");

  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  const addressRegistry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress
  );
  const registryAddress = await addressRegistry.chainlinkRegistryAddress();
  let registry = await ethers.getContractAt(
    "AssetAllocationRegistry",
    registryAddress
  );

  /****************************************/
  /********** CURVE FINANCE ***************/
  /****************************************/
  const CurvePeriphery = await ethers.getContractFactory("CurvePeriphery");
  const curve = await CurvePeriphery.deploy();
  await curve.deployed();

  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
  const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
  const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

  /*  Asset Allocations:
   *
   * Each asset allocation is a token placed in a particular way within
   * the APY.Finance system. The same token may have multiple allocations
   * managed in differing ways, whether they are held by different
   * contracts or subject to different holding periods.
   *
   * Each asset allocation must be registered with AssetAllocationRegistry,
   * in order for the Chainlink nodes to include it within their TVL
   * computation.
   *
   * The data required in an allocation is:
   *
   * allocationId (bytes32): a unique identifier across all allocations
   * symbol (string): the token symbol
   * decimals (uint256): the token decimals
   * data: a pair (address, bytes) where the bytes are encoded function
   *       calldata to be used at the target address
   */
  const calldataForDai = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      strategy.address,
      STABLE_SWAP_ADDRESS,
      LIQUIDITY_GAUGE_ADDRESS,
      LP_TOKEN_ADDRESS,
      0,
    ]
  );
  const calldataForUsdc = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      strategy.address,
      STABLE_SWAP_ADDRESS,
      LIQUIDITY_GAUGE_ADDRESS,
      LP_TOKEN_ADDRESS,
      1,
    ]
  );
  const calldataForUsdt = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      strategy.address,
      STABLE_SWAP_ADDRESS,
      LIQUIDITY_GAUGE_ADDRESS,
      LP_TOKEN_ADDRESS,
      2,
    ]
  );

  let trx = await registry.addAssetAllocation(
    bytes32("dai"),
    [curve.address, calldataForDai],
    "DAI",
    18
  );
  await trx.wait();
  trx = await registry.addAssetAllocation(
    bytes32("usdc"),
    [curve.address, calldataForUsdc],
    "USDC",
    6
  );
  await trx.wait();
  trx = await registry.addAssetAllocation(
    bytes32("usdt"),
    [curve.address, calldataForUsdt],
    "USDT",
    6
  );
  await trx.wait();

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
