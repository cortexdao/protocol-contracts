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
  getDeployedAddress,
  bytes32,
  getStablecoinAddress,
  tokenAmountToBigNumber,
  MAX_UINT256,
  impersonateAccount,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  const addressRegistry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress
  );

  const managerAddress = await addressRegistry.managerAddress();
  let manager = await ethers.getContractAt("APYManagerV2", managerAddress);
  const managerDeployer = await impersonateAccount(await manager.owner());
  manager = manager.connect(managerDeployer);

  console.log("");
  console.log("Funding strategy account from pools ...");
  console.log("");

  const accountAddress = await manager.getAccount(bytes32("alpha"));
  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20").abi
  );
  const encodedBalanceOf = ifaceERC20.encodeFunctionData("balanceOf(address)", [
    accountAddress,
  ]);

  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const tokenAddress = getStablecoinAddress(symbol, NETWORK_NAME);
    const token = await ethers.getContractAt("IDetailedERC20", tokenAddress);
    stablecoins[symbol] = token;
  }

  const daiAmount = tokenAmountToBigNumber("1000", "18");

  await manager.fundAccount(
    accountAddress,
    [[bytes32("daiPool")], [daiAmount]],
    [
      [
        bytes32("accountDaiBalance"),
        "DAI",
        18,
        [stablecoins["DAI"].address, encodedBalanceOf],
      ],
      [
        bytes32("accountUsdcBalance"),
        "USDC",
        6,
        [stablecoins["USDC"].address, encodedBalanceOf],
      ],
      [
        bytes32("accountUsdtBalance"),
        "USDT",
        6,
        [stablecoins["USDT"].address, encodedBalanceOf],
      ],
    ]
  );
  console.log("... done.");

  console.log("");
  console.log("Executing ...");
  console.log("");
  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
  const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
  const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";
  const ifaceStableSwap = new ethers.utils.Interface(
    artifacts.require("IStableSwap").abi
  );
  const approveStableSwap = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [STABLE_SWAP_ADDRESS, MAX_UINT256]
  );
  const approveGauge = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [LIQUIDITY_GAUGE_ADDRESS, MAX_UINT256]
  );
  const stableSwapAddLiquidity = ifaceStableSwap.encodeFunctionData(
    "add_liquidity(uint256[3],uint256)",
    [[daiAmount, 0, 0], 0]
  );
  const daiToken = stablecoins["DAI"];

  // const totalLPBalance = await lpToken.balanceOf(strategy.address);
  // await lpToken.connect(strategy).approve(gauge.address, MAX_UINT256);
  // await gauge.connect(strategy)["deposit(uint256)"](gaugeLpBalance);

  const executionSteps = [
    [daiToken.address, approveStableSwap], // approve StableSwap for DAI
    [LP_TOKEN_ADDRESS, approveGauge], // approve LiquidityGauge for LP token
    [STABLE_SWAP_ADDRESS, stableSwapAddLiquidity], // deposit DAI into Curve 3pool
  ];
  await manager.execute(accountAddress, executionSteps, []);
  console.log("... done.");
  console.log("");

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
