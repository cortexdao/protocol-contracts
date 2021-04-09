#!/usr/bin/env node
const { network } = require("hardhat");
const { program } = require("commander");
const registerAllocation = require("./register_allocation");
const { getAddressRegistry, getStrategyAccountInfo } = require("./utils");
const { bytes32 } = require("../../utils/helpers");

const pools = {
  "3pool": {
    stableSwap: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    lpToken: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    liquidityGauge: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
    underlying: [
      {
        symbol: "DAI",
        index: 0,
        decimals: 18,
      },
      {
        symbol: "USDC",
        index: 1,
        decimals: 6,
      },
      {
        symbol: "USDT",
        index: 2,
        decimals: 6,
      },
    ],
  },
};

program.requiredOption("-p, --pool <string>", "Curve pool symbol", "3pool");

async function registerCurve(pool) {
  const networkName = network.name.toUpperCase();
  const addressRegistry = await getAddressRegistry(networkName);
  const curvePeripheryAddress = await addressRegistry.getAddress(
    bytes32("curvePeriphery")
  );

  const [, accountAddress] = await getStrategyAccountInfo(networkName);

  const allocationIds = await Promise.all(
    pools[pool]["underlying"].map((underlying) =>
      registerAllocation(
        curvePeripheryAddress,
        "CurvePeriphery",
        "getUnderlyerBalance",
        underlying.symbol,
        underlying.decimals,
        [
          accountAddress,
          pools[pool]["stableSwap"],
          pools[pool]["liquidityGauge"],
          pools[pool]["lpToken"],
          underlying.index,
        ]
      )
    )
  );

  return allocationIds;
}

async function main(options) {
  const allocationIds = await registerCurve(options.pool);

  return allocationIds.toString();
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
  module.exports = registerCurve;
}
