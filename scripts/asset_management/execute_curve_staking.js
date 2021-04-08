#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { MAX_UINT256 } = require("../../utils/helpers");
const { program } = require("commander");

const { getAccountManager, getStrategyAccountInfo } = require("./utils");

program.requiredOption(
  "-t, --liquidityToken <string>",
  "Liquidity Token Address",
  "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"
);
program.requiredOption(
  "-g, --liquidityGauge <string>",
  "Liquidity Gauge Address",
  "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A"
);
program.requiredOption(
  "-a, --liquidityTokenAmt <string>",
  "Liquidity Token Amount",
  0
);

// eslint-disable-next-line no-unused-vars
async function executeStaking(lpTokenAddress, gaugeAddress, lpTokenAmount) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId] = await getStrategyAccountInfo(networkName);

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20").abi
  );
  const ifaceLiquidityGauge = new ethers.utils.Interface(
    artifacts.require("ILiquidityGauge").abi
  );

  // deposit into liquidity pool
  const approveGauge = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [gaugeAddress, MAX_UINT256]
  );
  const liquidityGaugeDeposit = ifaceLiquidityGauge.encodeFunctionData(
    "deposit(uint256)",
    [lpTokenAmount]
  );
  let executionSteps = [
    [lpTokenAddress, approveGauge], // approve LiquidityGauge for LP token
    [gaugeAddress, liquidityGaugeDeposit],
  ];
  await accountManager.execute(accountId, executionSteps, []);
}

async function main(options) {
  await executeStaking(
    options.liquidityToken,
    options.liquidityGauge,
    options.liquidityTokenAmt
  );
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
  module.exports = executeStaking;
}
