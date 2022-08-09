#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs").option("compile", {
  type: "boolean",
  default: true,
  description: "Compile contract using `compile:one`",
});
const hre = require("hardhat");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  MAX_UINT256,
  bytes32,
  deployAggregator,
} = require("../../utils/helpers");
const { ethers } = hre;

const ADDRESS_REGISTRY_ADDRESS = "0x7ec81b7035e91f8435bdeb2787dcbd51116ad303";

const CURVE_3CRV_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const CURVE_3CRV_WHALE_ADDRESS = "0xd632f22692fac7611d2aa1c0d552930d43caed3b"; // FRAX metapool

// use the USDC agg instead of 3CRV agg for now
const USDC_AGG_ADDRESS = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const [deployer, alice, oracle] = await ethers.getSigners();

  const curve3CrvWhale = await impersonateAccount(
    CURVE_3CRV_WHALE_ADDRESS,
    100
  );

  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    ADDRESS_REGISTRY_ADDRESS
  );
  // const registryOwnerAddress = await addressRegistry.owner();
  // const registryOwner = await impersonateAccount(registryOwnerAddress, 100);
  const emergencySafeAddress = await addressRegistry.emergencySafeAddress();
  const emergencySafe = await impersonateAccount(emergencySafeAddress);

  /*
   * Deploy TVL Aggregator
   *
   * This lets us set the deployed value to zero so we can test
   * the pool on its own.
   */
  console.log("Deploying TVL Agg ...");
  const paymentAmount = tokenAmountToBigNumber("1", 18); // LINK
  const maxSubmissionValue = tokenAmountToBigNumber("1", "20");
  const tvlAggConfig = {
    paymentAmount, // payment amount (price paid for each oracle submission, in wei)
    minSubmissionValue: 0,
    maxSubmissionValue,
    decimals: 8, // decimal offset for answer
    description: "TVL aggregator",
  };
  const tvlAgg = await deployAggregator(
    tvlAggConfig,
    oracle.address,
    deployer.address, // oracle owner
    deployer.address // ETH funder
  );

  /*
   * Deploy Oracle Adapter
   *
   */
  console.log("Deploying Oracle Adapter ...");
  const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
  const oracleAdapter = await OracleAdapter.deploy(
    ADDRESS_REGISTRY_ADDRESS,
    tvlAgg.address,
    [CURVE_3CRV_ADDRESS],
    [USDC_AGG_ADDRESS], // use the USDC agg since 3CRV agg not available on Mainnet yet
    86400,
    86400
  );
  await oracleAdapter.deployed();

  await addressRegistry
    .connect(emergencySafe)
    .registerAddress(bytes32("oracleAdapter"), oracleAdapter.address);

  await oracleAdapter.connect(emergencySafe).emergencySetTvl(0, 6000);

  /*
   * Deploy Index Token
   */
  const IndexToken = await ethers.getContractFactory("IndexToken");
  const indexToken = await IndexToken.deploy();
  await indexToken
    .connect(deployer)
    .initialize(ADDRESS_REGISTRY_ADDRESS, CURVE_3CRV_ADDRESS);
  console.log("Index token: %s", indexToken.address);

  const curve3Crv = await ethers.getContractAt(
    "IDetailedERC20",
    CURVE_3CRV_ADDRESS
  );
  const depositAmount = tokenAmountToBigNumber("1000000", 18);
  await curve3Crv
    .connect(curve3CrvWhale)
    .transfer(alice.address, depositAmount);

  await curve3Crv.connect(alice).approve(indexToken.address, MAX_UINT256);
  await indexToken.connect(alice).deposit(depositAmount, alice.address);
  console.log(
    "Alice index token balance: %s",
    (await indexToken.balanceOf(alice.address)) / 10 ** 18
  );

  // total 3CRV in the pool
  console.log("Total assets: %s", (await indexToken.totalAssets()) / 10 ** 18);
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Index token setup complete.");
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
