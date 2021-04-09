#!/usr/bin/env node
const { network } = require("hardhat");
const { program } = require("commander");
const registerAllocation = require("./register_allocation");
const { getStrategyAccountInfo } = require("./utils");

// HARDHAT_NETWORK=localhost node register_token.js -a 0xD533a949740bb3306d119CC777fa900bA034cd52 -s CRV -d 18
async function registerToken(address, symbol, decimals) {
  const networkName = network.name.toUpperCase();
  const [, accountAddress] = await getStrategyAccountInfo(networkName);

  const allocationId = await registerAllocation(
    address,
    "ERC20",
    "balanceOf",
    symbol,
    decimals,
    [accountAddress]
  );

  return allocationId;
}

async function main(options) {
  const allocationId = await registerToken(
    options.address,
    options.symbol,
    options.decimals
  );

  return allocationId;
}

if (!module.parent) {
  program.requiredOption("-a, --address <string>", "Token address", "0x0");
  program.requiredOption("-s, --symbol <string>", "Token symbol", "CRV");
  program.requiredOption("-d, --decimals <number>", "Token decimals", 18);
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
  module.exports = registerToken;
}
