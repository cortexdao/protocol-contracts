const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const { BigNumber } = require("ethers");
const { erc20, getStablecoinAddress } = require("./helpers.js");
const { send } = require("@openzeppelin/test-helpers");

const AMOUNTS = {
  // in token units, not wei
  DAI: 100000,
  USDC: 100000,
  USDT: 100000,
};

const STABLECOIN_POOLS = {
  // sUSD curve pool has plenty of these stablecoins
  // https://etherscan.io/address/0xa5407eae9ba41422680e2e00537571bcc53efbfd
  DAI: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  USDC: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  USDT: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
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

async function acquireToken(sender, recipient, token, amount, ethFunder) {
  /*
    sender: address, holds the tokens to be sent
    recipient: address, receives the tokens
    token: contract instance of token (ethers)
    amount: BigNumber or string, should be in big units not wei if string
    ethFunder: unlocked address holding ETH, e.g. hardhat test account
  */
  const decimals = await token.decimals();
  amount = tokenAmountToBigNumber(amount, decimals);
  await prepareTokenSender(sender, "0.25", ethFunder);
  const fundAccountSigner = await ethers.provider.getSigner(sender);

  const trx = await token
    .connect(fundAccountSigner)
    .transfer(recipient, amount);
  await trx.wait();
  const balance = (await token.balanceOf(recipient)).toString();
  const symbol = await token.symbol();
  console.log(`${symbol} balance: ${balance / 10 ** decimals}`);
}

async function prepareTokenSender(sender, ethAmount, ethFunder) {
  /* Need to do two things to allow sending stablecoin from the
    funding account to the recipient:

    1. ensure sender has ETH; if sender is a contract, such as a Curve
    pool that disallows receiving ETH, we need to do the selfdestruct
    trick to send it ETH.

    2. impersonate the sender account 
  */
  ethAmount = tokenAmountToBigNumber(ethAmount, "18");
  await forciblySendEth(sender, ethAmount, ethFunder);

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [sender],
  });
}

async function forciblySendEth(recipient, amount, ethFunder) {
  /* Will forcibly send ETH to any recipient, even a
    contract that rejects ETH.  Only requires that `ethFunder`
    has ETH to send to the EthSender contract, e.g. is a hardhat
    test account.
  */
  const EthSender = await ethers.getContractFactory("EthSender");
  const ethSender = await EthSender.deploy();
  await ethSender.deployed();
  await send.ether(ethFunder, ethSender.address, amount);
  await ethSender.send(recipient);
}

const tokenAmountToBigNumber = (amount, decimals) => {
  if (BigNumber.isBigNumber(amount)) return amount;

  amount = amount.toString();
  amount = erc20(amount, decimals);
  amount = BigNumber.from(amount.toString());
  return amount;
};

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
