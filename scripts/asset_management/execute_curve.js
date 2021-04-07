#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { MAX_UINT256 } = require("../../utils/helpers");
const { program } = require("commander");

const {
  getAccountManager,
  getStrategyAccountInfo,
  getStablecoins,
} = require("./utils");

program.requiredOption(
  "-s, --stableSwap <string>",
  "3Pool Address",
  "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
);

// eslint-disable-next-line no-unused-vars
async function main(options) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);
  const stablecoins = await getStablecoins(networkName);
  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20").abi
  );
  const ifaceStableSwap = new ethers.utils.Interface(
    artifacts.require("IStableSwap").abi
  );

  // 3Pool addresses:
  const STABLE_SWAP_ADDRESS = options.stableSwap;

  // deposit into liquidity pool
  const approveStableSwap = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [STABLE_SWAP_ADDRESS, MAX_UINT256]
  );

  const daiToken = stablecoins["DAI"];
  const daiAmount = await daiToken.balanceOf(accountAddress);
  const stableSwapAddLiquidity = ifaceStableSwap.encodeFunctionData(
    "add_liquidity(uint256[3],uint256)",
    [[daiAmount, 0, 0], 0]
  );

  let executionSteps = [
    [daiToken.address, approveStableSwap], // approve StableSwap for DAI
    [STABLE_SWAP_ADDRESS, stableSwapAddLiquidity], // deposit DAI into Curve 3pool
  ];
  await accountManager.execute(accountId, executionSteps, []);
}

if (!module.parent) {
  program.parse(process.argv);
  const options = program.opts();
  main(options)
    .then((result) => {
      if (!(typeof result === "string" || result instanceof Buffer)) {
        process.exit(1);
      }
      process.stdout.write(result);
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
} else {
  // if importing in another script
  module.exports = main;
}
