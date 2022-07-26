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
} = require("../../utils/helpers");
const { ethers } = hre;

const ADDRESS_REGISTRY_ADDRESS = "0x7ec81b7035e91f8435bdeb2787dcbd51116ad303";

const CURVE_3CRV_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const CURVE_3CRV_WHALE_ADDRESS = "0xd632f22692fac7611d2aa1c0d552930d43caed3b"; // FRAX metapool

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const [deployer, alice] = await ethers.getSigners();

  const curve_3crv_whale = await impersonateAccount(
    CURVE_3CRV_WHALE_ADDRESS,
    100
  );

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
    .connect(curve_3crv_whale)
    .transfer(alice.address, depositAmount);

  await curve3Crv.connect(alice).approve(indexToken.address, MAX_UINT256);
  await indexToken.connect(alice).deposit(depositAmount, alice.address);
  console.log(
    "Alice index token balance: %s",
    (await indexToken.balanceOf(alice.address)) / 10 ** 18
  );
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
