#!/usr/bin/env node
const { network } = require("hardhat");
const { program } = require("commander");
const registerAllocation = require("./register_allocation");
const { getAddressRegistry, getStrategyAccountInfo } = require("./utils");
const { bytes32 } = require("../../utils/helpers");

const aTokens = {
  aDAI: {
    address: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
    symbol: "DAI",
    decimals: 18,
  },
  aUSDC: {
    address: "0xBcca60bB61934080951369a648Fb03DF4F96263C",
    symbol: "USDC",
    decimals: 6,
  },
  aUSDT: {
    address: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
    symbol: "USDT",
    decimals: 6,
  },
};

program.requiredOption("-a, --atoken <string>", "aToken symbol", "aDAI");

async function registerAave(aTokenSymbol) {
  const networkName = network.name.toUpperCase();
  const addressRegistry = await getAddressRegistry(networkName);
  const aavePeripheryAddress = await addressRegistry.getAddress(
    bytes32("aavePeriphery")
  );

  const [, accountAddress] = await getStrategyAccountInfo(networkName);

  const allocationId = await registerAllocation(
    aavePeripheryAddress,
    "AavePeriphery",
    "getUnderlyerBalance",
    aTokens[aTokenSymbol].symbol,
    aTokens[aTokenSymbol].decimals,
    [accountAddress, aTokens[aTokenSymbol].address]
  );

  return allocationId;
}

async function main(options) {
  const allocationId = await registerAave(options.atoken);

  return allocationId;
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
    .catch((e) => {
      process.stdout.write(e.message);
      process.exit(1);
    });
} else {
  // if importing in another script
  module.exports = registerAave;
}
