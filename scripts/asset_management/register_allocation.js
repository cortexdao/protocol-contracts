#!/usr/bin/env node
const { ethers, network } = require("hardhat");
const { program } = require("commander");
const { getTvlManager } = require("./utils");

// Test command:
// HARDHAT_NETWORK=localhost node register_allocation.js -a 0xDcCFbe55dAF6388B44BE1D4C58D82450d42e7944 -c CurvePeriphery -f getUnderlyerBalance -s DAI -d 18 -g 0xE6dFC68D8f0bB24EFA27d9c9A12bCB40a336719F 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7 0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490 0
program.requiredOption(
  "-a, --address <string>",
  "Periphery contract address",
  "0x0"
);

program.requiredOption(
  "-c, --contract <string>",
  "Periphery contract name",
  "CurvePeriphery"
);

program.requiredOption(
  "-f, --function <string>",
  "Periphery contract function fragment (can be name or signature)",
  "getUnderlyerBalance"
);

program.requiredOption("-s, --symbol <string>", "Asset symbol", "DAI");

program.requiredOption("-d, --decimals <number>", "Asset decimals", 18);

program.option("-g, --functionArgs <type...>", "Specify arguments");

async function registerAllocation(
  address,
  contract,
  functionName,
  symbol,
  decimals,
  functionArgs
) {
  const networkName = network.name.toUpperCase();
  const tvlManager = await getTvlManager(networkName);

  const instance = await ethers.getContractFactory(contract);

  const calldata = instance.interface.encodeFunctionData(
    functionName,
    functionArgs
  );
  const data = [address, calldata];

  const trx = await tvlManager.addAssetAllocation(data, symbol, decimals);
  await trx.wait();

  const allocationId = await tvlManager.generateDataHash(data);

  return allocationId;
}

// eslint-disable-next-line no-unused-vars
async function main(options) {
  const allocationId = await registerAllocation(
    options.address,
    options.contract,
    options.function,
    options.symbol,
    options.decimals,
    options.functionArgs
  );

  console.log(allocationId);
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
  module.exports = registerAllocation;
}
