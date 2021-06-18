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
const { getDeployedAddress } = require("../../utils/helpers");
const {
  SafeEthersSigner,
  SafeService,
} = require("@gnosis.pm/safe-ethers-adapters");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer, strategy] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const service = new SafeService(process.env.SERVICE_URL);
  const safeSigner = await SafeEthersSigner.create(
    process.env.LP_SAFE,
    deployer,
    service,
    deployer.provider
  );

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    NETWORK_NAME
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress
  );
  const registryAddress = await addressRegistry.chainlinkRegistryAddress();
  const tvlManager = await ethers.getContractAt("TVLManager", registryAddress);

  console.log("");
  console.log("Registering ...");
  console.log("");

  /****************************************/
  /********** CURVE FINANCE ***************/
  /****************************************/

  console.log("");
  console.log("Curve 3pool");
  console.log("");
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
   * Each asset allocation must be registered with TVLManager,
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

  let trx = await tvlManager
    .connect(safeSigner)
    .addAssetAllocation([curve.address, calldataForDai], "DAI", 18);
  await trx.wait();
  trx = await tvlManager
    .connect(safeSigner)
    .addAssetAllocation([curve.address, calldataForUsdc], "USDC", 6);
  await trx.wait();
  trx = await tvlManager
    .connect(safeSigner)
    .addAssetAllocation([curve.address, calldataForUsdt], "USDT", 6);
  await trx.wait();

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
