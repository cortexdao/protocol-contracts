#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { program } = require("commander");

const { getAccountManager, getStrategyAccountInfo } = require("./utils");
const { MAX_UINT256 } = require("../../utils/helpers");

const UNISWAP_V2_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// eslint-disable-next-line no-unused-vars
async function liquidateUniswap(liquidityTokenAddress, liquidityTokenAmount) {
  const networkName = network.name.toUpperCase();
  const accountManager = await getAccountManager(networkName);
  const [accountId, accountAddress] = await getStrategyAccountInfo(networkName);

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20UpgradeSafe").abi
  );
  const ifaceUniswapRouter = new ethers.utils.Interface(
    artifacts.require("IUniswapV2Router").abi
  );

  const lpToken = await ethers.getContractAt(
    "IUniswapV2Pair",
    liquidityTokenAddress
  );

  const approveRouter = ifaceERC20.encodeFunctionData(
    "approve(address,uint256)",
    [UNISWAP_V2_ROUTER_ADDRESS, MAX_UINT256]
  );

  const token0 = await lpToken.token0();
  const token1 = await lpToken.token1();
  const uniswapRemoveLiquidity = ifaceUniswapRouter.encodeFunctionData(
    "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
    [token0, token1, liquidityTokenAmount, 1, 1, accountAddress, MAX_UINT256]
  );

  let executionSteps = [
    [liquidityTokenAddress, approveRouter],
    [UNISWAP_V2_ROUTER_ADDRESS, uniswapRemoveLiquidity],
  ];
  await accountManager.execute(accountId, executionSteps, []);
}

async function main(options) {
  await liquidateUniswap(options.lpTokenAddress, options.lpTokenAmount);
}

if (!module.parent) {
  program.requiredOption(
    "-s, --lpTokenAddress <string>",
    "liquidity token address",
    "0x3041cbd36888becc7bbcbc0045e3b1f144466f5f"
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
  module.exports = liquidateUniswap;
}
