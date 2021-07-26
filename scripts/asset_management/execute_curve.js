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
program.requiredOption(
  "-a, --amounts <items>",
  "comma separated list of pool amounts",
  commaSeparatedList
);
program.option("-m, --min <string>", "min amount required", 0);

async function executeCurve(stableSwapAddress, amountsArray, min) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId] = await getStrategyAccountInfo(networkName);
  const stablecoins = await getStablecoins(networkName);

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20UpgradeSafe").abi
  );
  const ifaceStableSwap = new ethers.utils.Interface(
    artifacts.require("IStableSwap").abi
  );

  // deposit into liquidity pool
  const approveStableSwap = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [stableSwapAddress, MAX_UINT256]
  );

  const daiToken = stablecoins["DAI"];
  const stableSwapAddLiquidity = ifaceStableSwap.encodeFunctionData(
    "add_liquidity(uint256[3],uint256)",
    [amountsArray, min]
  );

  let executionSteps = [
    [daiToken.address, approveStableSwap], // approve StableSwap for DAI
    [stableSwapAddress, stableSwapAddLiquidity], // deposit DAI into Curve 3pool
  ];
  await accountManager.execute(accountId, executionSteps, []);
}

// eslint-disable-next-line no-unused-vars
function commaSeparatedList(value, dummyPrevious) {
  return value.split(",");
}

async function main(options) {
  await executeCurve(options.stableSwap, options.amounts, options.min);
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
  module.exports = executeCurve;
}
