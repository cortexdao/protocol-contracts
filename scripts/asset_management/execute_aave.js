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
  "-p, --lendingPool <string>",
  "Aave Lending Pool",
  "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9"
);

program.requiredOption("-s, --tokenSymbol <string>", "token symbol", "DAI");

program.requiredOption("-a, --tokenAmount <string>", "token amount", 0);

// eslint-disable-next-line no-unused-vars
async function executeAave(lendingPool, symbol, amount) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);
  const stablecoins = await getStablecoins(networkName);

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20UpgradeSafe").abi
  );
  const ifaceLendingPool = new ethers.utils.Interface(
    artifacts.require("IAaveLendingPool").abi
  );

  // deposit into liquidity pool
  const token = stablecoins[symbol.toUpperCase()];
  const approveLendingPool = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [lendingPool, MAX_UINT256]
  );
  const lendingPoolDeposit = ifaceLendingPool.encodeFunctionData(
    "deposit(address,uint256,address,uint16)",
    [token.address, amount, accountAddress, 0]
  );

  let executionSteps = [
    [token.address, approveLendingPool], // approve lending pool for DAI
    [lendingPool, lendingPoolDeposit], // deposit DAI into Aave lending pool
  ];
  await accountManager.execute(accountId, executionSteps, []);
}

async function main(options) {
  await executeAave(
    options.lendingPool,
    options.tokenSymbol,
    options.tokenAmount
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
  module.exports = executeAave;
}
