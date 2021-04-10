#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { program } = require("commander");

const { getAccountManager, getStrategyAccountInfo } = require("./utils");

// eslint-disable-next-line no-unused-vars
async function liquidateCurve(stableSwapAddress, liquidityTokenAmount) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId] = await getStrategyAccountInfo(networkName);

  const ifaceStableSwap = new ethers.utils.Interface(
    artifacts.require("IStableSwap").abi
  );

  const stableSwapRemoveLiquidity = ifaceStableSwap.encodeFunctionData(
    "remove_liquidity_one_coin(uint256,int128,uint256)",
    [liquidityTokenAmount, 0, 0]
  );

  let executionSteps = [
    [stableSwapAddress, stableSwapRemoveLiquidity], // deposit DAI into Curve 3pool
  ];
  await accountManager.execute(accountId, executionSteps, []);
}

async function main(options) {
  await liquidateCurve(options.stableSwapAddress, options.lpTokenAmount);
}

if (!module.parent) {
  program.requiredOption(
    "-s, --stableSwapAddress <string>",
    "stable swap address",
    "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
  );
  program.requiredOption(
    "-a, --lpTokenAmount <string>",
    "liquidity token amount",
    0
  );
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
  module.exports = liquidateCurve;
}
