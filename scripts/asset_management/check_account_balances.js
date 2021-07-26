#!/usr/bin/env node
const hre = require("hardhat");
const { network, ethers } = hre;
const { program } = require("commander");
const {
  commify,
  formatUnits,
  getDeployedAddress,
} = require("../../utils/helpers");

program.requiredOption(
  "-t, --tokenAddresses <items>",
  "comma separated list of token addresses",
  commaSeparatedList,
  [
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", //DAI
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", //USDC
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", //USDT
    "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490", //3Crv LP token
    "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A", //3Crv gauge
    "0x3041CbD36888bECc7bbCBc0045E3B1f144466f5f", //USDC/USDT Pair LP
    "0x028171bCA77440897B824Ca71D1c56caC55b68A3", //ADAI
  ]
);

const invalidERC20s = ["0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A"]; // 3Crv gauge

// eslint-disable-next-line no-unused-vars
async function checkBalances(addresses) {
  const balances = {};
  const NETWORK_NAME = network.name.toUpperCase();
  const lpSafeAddress = getDeployedAddress("LpSafe", NETWORK_NAME);
  for (let i = 0; i < addresses.length; i++) {
    const token = await ethers.getContractAt(
      "IDetailedERC20UpgradeSafe",
      addresses[i]
    );
    const balance = await token.balanceOf(lpSafeAddress);
    if (invalidERC20s.includes(addresses[i])) {
      balances[addresses[i]] = { balance: balance };
    } else {
      const sym = await token.symbol();
      const decimals = await token.decimals();
      balances[sym] = { balance: balance, decimal: decimals };
    }
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
    if (invalidERC20s.includes(keys[i])) {
      console.log(
        `${keys[i]} Balance: ${commify(formatUnits(balance, 18))}, ${balance}`
      );
    } else {
      const decimal = data.decimal;
      console.log(
        `${keys[i]} Balance: ${commify(
          formatUnits(balance, decimal)
        )}, ${balance}`
      );
    }
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
