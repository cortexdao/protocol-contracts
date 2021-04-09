#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { MAX_UINT256 } = require("../../utils/helpers");
const { program } = require("commander");

const {
  getAccountManager,
  getStrategyAccountInfo,
  getTvlManager,
  getStablecoins,
} = require("./utils");
const { getAssetAllocationValue } = require("./get_assetallocation_value");

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

program.requiredOption(
  "-i, --assetAllocationId <string>",
  "asset allocation id",
  "0x25dabd4989b405009f11566b2f49654e3b07db8da50c16d42fb2832e5cf3ce32"
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
  assetAlloId,
  tokenSymbol,
  tokenAmount
) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);
  const stablecoins = await getStablecoins(networkName);

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20").abi
  );
  const ifaceLendingPool = new ethers.utils.Interface(
    artifacts.require("IAaveLendingPool").abi
  );

  const token = stablecoins[tokenSymbol.toUpperCase()];
  const tvlManager = await getTvlManager(networkName);
  const balance = await tvlManager.balanceOf(assetAlloId);
  const symbol = await tvlManager.symbolOf(assetAlloId);
  const decimals = await tvlManager.decimalsOf(assetAlloId);
  const assetAllocations = [{ balance, symbol, decimals }];
  console.log(assetAllocations);
  const value = await getAssetAllocationValue(assetAllocations);
  console.log("here");
  const aAmount = ethers.BigNumber.from(tokenAmount)
    .mul(tokenAmount)
    .div(value);

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
  await accountManager.execute(accountId, executionSteps, []);
}

async function main(options) {
  await liquidateAave(
    options.lendingPool,
    options.lpTokenAddress,
    options.assetAllocationId,
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
