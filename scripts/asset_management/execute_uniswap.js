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
  "-a, --tokenASymbol <string>",
  "Token A Symbol",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
);
program.requiredOption(
  "-b, --tokenBSymbol <string>",
  "Token B Symbol",
  "0xdAC17F958D2ee523a2206206994597C13D831ec7"
);
program.requiredOption("-x, --tokenAAmount <string>", "Token A Amount", 0);
program.requiredOption("-y, --tokenBAmount <string>", "Token B Amount", 0);

const UNISWAP_V2_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// eslint-disable-next-line no-unused-vars
async function executeUniswap(
  tokenASymbol,
  tokenBSymbol,
  tokenAAmount,
  tokenBAmount
) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);
  const stablecoins = await getStablecoins(networkName);
  const tokenA = stablecoins[tokenASymbol];
  const tokenB = stablecoins[tokenBSymbol];

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20UpgradeSafe").abi
  );

  const ifaceUniswapRouter = new ethers.utils.Interface(
    artifacts.require("IUniswapV2Router").abi
  );

  const approveRouter = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [UNISWAP_V2_ROUTER_ADDRESS, MAX_UINT256]
  );
  const uniswapAddLiquidity = ifaceUniswapRouter.encodeFunctionData(
    "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
    [
      tokenA.address,
      tokenB.address,
      tokenAAmount,
      tokenBAmount,
      1,
      1,
      accountAddress,
      MAX_UINT256,
    ]
  );

  let executionSteps = [
    [tokenA.address, approveRouter],
    [tokenB.address, approveRouter],
    [UNISWAP_V2_ROUTER_ADDRESS, uniswapAddLiquidity],
  ];
  await accountManager.execute(accountId, executionSteps, []);
}
async function main(options) {
  await executeUniswap(
    options.tokenASymbol,
    options.tokenBSymbol,
    options.tokenAAmount,
    options.tokenBAmount
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
  module.exports = executeUniswap;
}
