#!/usr/bin/env node
const hre = require("hardhat");
const { artifacts, ethers, network } = hre;
const _ = require("lodash");

const { program } = require("commander");

const {
  getStrategyAccountInfo,
  getPoolManager,
  getStablecoins,
  getAccountManager,
} = require("./utils");
const { bytes32, MAX_UINT256 } = require("../../utils/helpers");
const { BigNumber } = ethers;

const NETWORK_NAME = network.name.toUpperCase();

class RuntimeError extends Error {
  constructor(message, exitStatus) {
    super(message);
    this.name = "RuntimeError";
    this.exitStatus = exitStatus;
  }
}

program
  .requiredOption("-p, --pools <string...>", "APY stablecoin pool type")
  .requiredOption("-a, --amounts <string...>", "Max amounts to push");

async function topUpPools(symbols, maxAmounts) {
  symbols = symbols.map((s) => s.toUpperCase());
  maxAmounts = maxAmounts.map((a) => BigNumber.from(a.replace(/^'|'$/g, "")));
  for (const symbol of symbols) {
    if (!["DAI", "USDC", "USDT"].includes(symbol))
      throw new RuntimeError(`'pool' parameter not recognized: ${symbol}`, 2);
  }

  const [accountId, accountAddress] = await getStrategyAccountInfo(
    NETWORK_NAME
  );

  const poolManager = await getPoolManager(NETWORK_NAME);

  const amounts = await Promise.all(
    _.zip(symbols, maxAmounts).map(([symbol, maxAmount]) =>
      getAvailableAmountAndSetAllowance(
        accountAddress,
        symbol,
        maxAmount,
        poolManager.address,
        NETWORK_NAME
      )
    )
  );

  const poolIds = symbols.map((s) => bytes32(s.toLowerCase() + "Pool"));
  let poolAmounts = _.zip(poolIds, amounts).map(([poolId, amount]) => {
    return {
      poolId,
      amount,
    };
  });
  poolAmounts = _.filter(poolAmounts, (p) => p.amount.gt("0"));

  await poolManager.withdrawFromAccount(accountId, poolAmounts);

  return amounts.map((a) => a.toString()).join(" ");
}

async function main(options) {
  const symbols = options.pools;
  const maxAmounts = options.amounts;
  const result = await topUpPools(symbols, maxAmounts);
  return result.toString();
}

async function getAvailableAmountAndSetAllowance(
  accountAddress,
  symbol,
  maxAmount,
  poolManagerAddress,
  networkName
) {
  const amount = await getAvailableAmount(
    accountAddress,
    symbol,
    maxAmount,
    networkName
  );

  await setAllowanceForManager(poolManagerAddress, symbol, networkName);

  return amount;
}

async function getAvailableAmount(
  accountAddress,
  symbol,
  maxAmount,
  networkName
) {
  if (maxAmount.lte("0")) return BigNumber.from("0");

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
    .catch((error) => {
      const exitStatus = error.exitStatus || 1;
      process.exit(exitStatus);
    });
} else {
  module.exports = topUpPools;
}
