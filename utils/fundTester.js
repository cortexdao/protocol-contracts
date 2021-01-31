const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const { STABLECOIN_POOLS } = require("./constants");
const { getStablecoinAddress, acquireToken, console } = require("./helpers");

console.debugging = true;

const AMOUNTS = {
  // in token units, not wei
  DAI: 100000,
  USDC: 100000,
  USDT: 100000,
};

async function main(argv) {
  await hre.run("compile");
  console.log("Acquire stablecoins for testing ...");
  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const stablecoinAddress = getStablecoinAddress(symbol, network.name);
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      stablecoinAddress
    );
  }

  const testAccountIndex = argv.accountIndex || 0;
  console.log("Account index:", testAccountIndex);
  const signers = await ethers.getSigners();
  const tester = await signers[testAccountIndex].getAddress();
  console.log("Recipient address:", tester);

  for (const symbol of Object.keys(stablecoins)) {
    const token = stablecoins[symbol];
    let amount = AMOUNTS[symbol].toString();
    const sender = STABLECOIN_POOLS[symbol];
    await acquireToken(sender, tester, token, amount, tester);
  }
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
