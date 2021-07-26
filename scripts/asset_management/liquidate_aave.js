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

program.requiredOption(
  "-l, --lpTokenAddress <string>",
  "liquidity token address",
  "0x028171bCA77440897B824Ca71D1c56caC55b68A3"
);

program.requiredOption("-s, --tokenSymbol <string>", "token symbol", "DAI");

program.requiredOption(
  "-a, --tokenAmount <string>",
  "liquidity token amount",
  0
);

// eslint-disable-next-line no-unused-vars
async function liquidateAave(
  lendingPool,
  lpTokenAddress,
  tokenSymbol,
  tokenAmount
) {
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

  const token = stablecoins[tokenSymbol.toUpperCase()];
  const aAmount = ethers.BigNumber.from(tokenAmount);
  const approveLendingPool = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [lendingPool, MAX_UINT256]
  );
  const lendingPoolWithdraw = ifaceLendingPool.encodeFunctionData(
    "withdraw(address,uint256,address)",
    [token.address, aAmount, accountAddress]
  );
  let executionSteps = [
    [lpTokenAddress, approveLendingPool],
    [lendingPool, lendingPoolWithdraw],
  ];
  const trx = await accountManager.execute(accountId, executionSteps, []);
  await trx.wait();
}

async function main(options) {
  await liquidateAave(
    options.lendingPool,
    options.lpTokenAddress,
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
  module.exports = liquidateAave;
}
