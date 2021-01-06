require("dotenv").config();
const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const { erc20, getStablecoinAddress } = require("../../utils/helpers.js");
const { ether, send } = require("@openzeppelin/test-helpers");
const { WHALE_ADDRESSES } = require("../../utils/constants.js");

async function acquireToken(fundAccount, receiver, token, amount) {
  /* NOTE: Ganache is setup to control "whale" addresses. This method moves
  requested funds out of the fund account and into the specified wallet */

  amount = amount.toString();
  const fundAccountSigner = await ethers.provider.getSigner(fundAccount);
  const trx = await token.connect(fundAccountSigner).transfer(receiver, amount);
  trx.wait();
  const tokenBal = await token.balanceOf(receiver);
  const symbol = await token.symbol();
  console.log(`${symbol} balance: ${tokenBal.toString()}`);
}

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
  console.log("");

  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const stablecoinAddress = getStablecoinAddress(symbol, NETWORK_NAME);
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      stablecoinAddress
    );
  }

  const testAccountIndex = argv.accountIndex || 1;
  console.log("Account index:", testAccountIndex);
  const testerAddress = await signers[testAccountIndex].getAddress();
  console.log("Recipient address:", testerAddress);
  const amounts = {
    // in token units, not wei
    DAI: 100000,
    USDC: 100000,
    USDT: 100000,
  };

  console.log("Acquire stablecoins for testing ...");
  for (const symbol of Object.keys(stablecoins)) {
    const token = stablecoins[symbol];
    let amount = amounts[symbol].toString();
    amount = erc20(amount, await token.decimals());
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [WHALE_ADDRESSES[symbol]],
    });
    await send.ether(deployer, WHALE_ADDRESSES[symbol], ether("0.25"));
    await acquireToken(WHALE_ADDRESSES[symbol], testerAddress, token, amount);
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
