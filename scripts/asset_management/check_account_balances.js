#!/usr/bin/env node
const hre = require("hardhat");
const { network, ethers } = hre;
const { program } = require("commander");
const { commify, formatUnits } = require("../../utils/helpers");
const { getStrategyAccountInfo } = require("./utils");

program.requiredOption(
  "-t, --tokenAddresses <items>",
  "comma separated list of token addresses",
  commaSeparatedList,
  [
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", //DAI
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", //USDC
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", //USDT
    "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490", //3Crv
  ]
);

// eslint-disable-next-line no-unused-vars
async function checkBalances(addresses) {
  const balances = {};
  const NETWORK_NAME = network.name.toUpperCase();
  const [, accountAddress] = await getStrategyAccountInfo(NETWORK_NAME);
  for (let i = 0; i < addresses.length; i++) {
    const token = await ethers.getContractAt("IDetailedERC20", addresses[i]);
    const sym = await token.symbol();
    const balance = await token.balanceOf(accountAddress);
    const decimals = await token.decimals();
    balances[sym] = { balance: balance, decimal: decimals };
  }
  return balances;
}

// eslint-disable-next-line no-unused-vars
function commaSeparatedList(value, dummyPrevious) {
  return value.split(",");
}

async function main(options) {
  const results = await checkBalances(options.tokenAddresses);
  const keys = Object.keys(results);
  for (let i = 0; i < keys.length; i++) {
    const data = results[keys[i]];
    const balance = data.balance;
    const decimals = data.decimals;
    console.log(
      `${keys[i]} Balance: ${commify(
        formatUnits(balance, decimals)
      )}, ${balance}`
    );
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
  // if importing in another script
  module.exports = checkBalances;
}
