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
const { ethers, network, artifacts } = require("hardhat");
const { expect } = require("chai");
const {
  getDeployedAddress,
  impersonateAccount,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
  MAX_UINT256,
  bytes32,
} = require("../../utils/helpers");
const { STABLECOIN_POOLS } = require("../../utils/constants");

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
  // const registryDeployer = await impersonateAccount(await registry.owner());
  // registry = registry.connect(registryDeployer);

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

  const daiIndex = 0;
  const daiAddress = getStablecoinAddress("DAI", "MAINNET");
  const daiToken = await ethers.getContractAt("IDetailedERC20", daiAddress);

  const decimals = await daiToken.decimals();
  const amount = tokenAmountToBigNumber("10000", decimals);
  const sender = STABLECOIN_POOLS["DAI"];
  await acquireToken(sender, strategy, daiToken, amount, deployer);

  const daiAmount = tokenAmountToBigNumber("1000", 18);
  const minAmount = 0;

  const IDetailedERC20 = artifacts.require("IDetailedERC20");
  const IStableSwap = artifacts.require("IStableSwap");
  const ILiquidityGauge = artifacts.require("ILiquidityGauge");

  const lpToken = await ethers.getContractAt(
    IDetailedERC20.abi,
    LP_TOKEN_ADDRESS
  );
  const stableSwap = await ethers.getContractAt(
    IStableSwap.abi,
    STABLE_SWAP_ADDRESS
  );
  const gauge = await ethers.getContractAt(
    ILiquidityGauge.abi,
    LIQUIDITY_GAUGE_ADDRESS
  );
  // use sequence
  await daiToken.connect(strategy).approve(stableSwap.address, MAX_UINT256);
  await stableSwap
    .connect(strategy)
    .add_liquidity([daiAmount, "0", "0"], minAmount);

  // split LP tokens between strategy and gauge
  const totalLPBalance = await lpToken.balanceOf(strategy.address);
  // const strategyLpBalance = totalLPBalance.div(3);
  // const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
  // expect(gaugeLpBalance).to.be.gt(0);
  // expect(strategyLpBalance).to.be.gt(0);
  // use sequence
  // await lpToken.connect(strategy).approve(gauge.address, MAX_UINT256);
  // await gauge.connect(strategy)["deposit(uint256)"](gaugeLpBalance);

  const poolBalance = await stableSwap.balances(daiIndex);
  const lpTotalSupply = await lpToken.totalSupply();

  const expectedBalance = totalLPBalance.mul(poolBalance).div(lpTotalSupply);
  expect(expectedBalance).to.be.gt(0);

  const balance = await curve.getUnderlyerBalance(
    strategy.address,
    stableSwap.address,
    gauge.address,
    lpToken.address,
    daiIndex
  );
  expect(balance).to.equal(expectedBalance);
  // let trx = ...
  // await trx.wait()
  const calldata = CurvePeriphery.interface.encodeFunctionData(
    "getUnderlyerBalance(address,address,address,address,uint256)",
    [
      strategy.address,
      stableSwap.address,
      gauge.address,
      lpToken.address,
      daiIndex,
    ]
  );

  const allocationId = bytes32("1");
  const data = [curve.address, calldata];
  const symbol = "DAI";
  await registry.addAssetAllocation(allocationId, data, symbol);
  expect(await registry.balanceOf(allocationId)).to.equal(balance);

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
