/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network, artifacts } = require("hardhat");
const {
  tokenAmountToBigNumber,
  MAX_UINT256,
  getStablecoinAddress,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer, strategy] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";

  const daiIndex = 0;
  const daiAddress = getStablecoinAddress("DAI", "MAINNET");
  const daiToken = await ethers.getContractAt("IDetailedERC20", daiAddress);

  const decimals = await daiToken.decimals();

  const daiAmount = tokenAmountToBigNumber("100", 18);
  const minAmount = 0;

  const IStableSwap = artifacts.require("IStableSwap");

  const stableSwap = await ethers.getContractAt(
    IStableSwap.abi,
    STABLE_SWAP_ADDRESS
  );
  // use sequence
  await daiToken.connect(strategy).approve(stableSwap.address, MAX_UINT256);
  await stableSwap
    .connect(strategy)
    .add_liquidity([daiAmount, "0", "0"], minAmount);
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
