#!/usr/bin/env node
const hre = require("hardhat");
const { ethers, network } = hre;

const { program } = require("commander");

const { getStrategyAccountInfo } = require("./utils");
const { getStablecoinAddress } = require("../../utils/helpers");

const NETWORK_NAME = network.name.toUpperCase();

program.option("-s, --symbol <string>", "Token symbol");
program.option("-a, --address <string>", "Token address");

const SYMBOL_TO_ADDDRESS = {
  DAI: getStablecoinAddress("DAI", NETWORK_NAME),
  USDC: getStablecoinAddress("USDC", NETWORK_NAME),
  USDT: getStablecoinAddress("USDT", NETWORK_NAME),
};

async function getTokenBalance(symbol, tokenAddress) {
  if (!!symbol == !!tokenAddress)
    throw new Error(
      "Must provide exactly one of 'symbol' or 'address' parameters."
    );
  if (!tokenAddress) {
    symbol = symbol.toUpperCase();
    tokenAddress = SYMBOL_TO_ADDDRESS[symbol];
    if (!tokenAddress)
      throw new Error(`'symbol' value not recognized: ${symbol}`);
  }

  const token = await ethers.getContractAt(
    "IDetailedERC20UpgradeSafe",
    tokenAddress
  );
  const [, accountAddress] = await getStrategyAccountInfo(NETWORK_NAME);
  const balance = await token.balanceOf(accountAddress);
  return balance;
}

async function main(options) {
  const symbol = options.symbol;
  const tokenAddress = options.address;
  const amount = await getTokenBalance(symbol, tokenAddress);
  return amount.toString();
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
