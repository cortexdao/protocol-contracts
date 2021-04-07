#!/usr/bin/env node
const hre = require("hardhat");
const { artifacts, ethers, network } = hre;
const { BigNumber } = ethers;

const { program } = require("commander");

const {
  getStrategyAccountInfo,
  getPoolManager,
  getStablecoins,
  getAccountManager,
} = require("./utils");
const { bytes32, MAX_UINT256 } = require("../../utils/helpers");

const NETWORK_NAME = network.name.toUpperCase();

program.requiredOption("-p, --pool <string>", "APY stablecoin pool type");
program.requiredOption("-a, --amount <string>", "Max amount to push");

async function main(options) {
  const symbol = options.pool.toUpperCase();
  if (!["DAI", "USDC", "USDT"].includes(symbol))
    throw new Error(`'pool' parameter not recognized: ${symbol}`);

  const maxAmount = BigNumber.from(options.amount);
  if (maxAmount.lte(0)) {
    throw new Error("Max amount should be positive.");
  }

  const [accountId, accountAddress] = await getStrategyAccountInfo(
    NETWORK_NAME
  );

  let poolId = symbol.toLowerCase() + "Pool";
  poolId = bytes32(poolId);

  const amount = await getAvailableAmount(
    accountAddress,
    symbol,
    maxAmount,
    NETWORK_NAME
  );

  const poolManager = await getPoolManager(NETWORK_NAME);
  await setAllowanceForManager(poolManager.address, symbol, NETWORK_NAME);

  if (amount.eq("0")) return "0";

  const poolAmounts = [
    {
      poolId,
      amount,
    },
  ];
  await poolManager.withdrawFromAccount(accountId, poolAmounts);

  return amount.toString();
}

async function getAvailableAmount(
  accountAddress,
  symbol,
  maxAmount,
  networkName
) {
  const stablecoins = await getStablecoins(networkName);
  const underlyer = stablecoins[symbol.toUpperCase()];
  let availableAmount = await underlyer.balanceOf(accountAddress);
  availableAmount = maxAmount.lt(availableAmount) ? maxAmount : availableAmount;
  return availableAmount;
}

async function setAllowanceForManager(poolManagerAddress, symbol, networkName) {
  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);
  const stablecoins = await getStablecoins(networkName);
  const accountManager = await getAccountManager(networkName);

  const allowance = await stablecoins[symbol].allowance(
    accountAddress,
    poolManagerAddress
  );
  if (allowance.isZero()) {
    const ifaceERC20 = new ethers.utils.Interface(
      artifacts.require("IDetailedERC20").abi
    );
    const approveManager = ifaceERC20.encodeFunctionData(
      "approve(address,uint256)",
      [poolManagerAddress, MAX_UINT256]
    );
    const executionSteps = [[stablecoins[symbol].address, approveManager]];

    await accountManager.execute(accountId, executionSteps, []);
  }
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
  module.exports = main;
}
