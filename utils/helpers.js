const hre = require("hardhat");
const { artifacts, ethers, web3 } = hre;
const { BigNumber } = ethers;
const { ether, BN, send } = require("@openzeppelin/test-helpers");
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
} = require("../utils/constants.js");
const fs = require("fs");
const axios = require("axios");
const IMintableERC20 = artifacts.require("IMintableERC20");

const bytes32 = ethers.utils.formatBytes32String;

const dai = ether;

const erc20 = (amount, decimals) => {
  amount = amount.toString();
  decimals = (decimals || "18").toString();
  let [wholePart, fracPart] = amount.split(".");
  fracPart = fracPart || "0";
  if (fracPart.length > decimals) {
    throw new Error(
      "Cannot convert ERC20 token amount to bits: decimal part is too long."
    );
  }
  while (fracPart.length < decimals) {
    fracPart += "0";
  }
  fracPart = new BN(fracPart);
  wholePart = new BN(wholePart || "0");

  const base = new BN("10").pow(new BN(decimals));
  const amountBits = wholePart.mul(base).add(fracPart);
  return amountBits;
};

const undoErc20 = (amount, decimals) => {
  decimals = (decimals || "18").toString();
  let base = "1";
  while (decimals > 0) {
    base += "0";
    decimals -= 1;
  }
  return amount.div(new BN(base));
};

const tokenAmountToBigNumber = (amount, decimals) => {
  if (BigNumber.isBigNumber(amount)) return amount;

  amount = amount.toString();
  amount = erc20(amount, decimals);
  amount = BigNumber.from(amount.toString());
  return amount;
};

const mintERC20Tokens = async (
  tokenAddress,
  receiverAddress,
  ownerAddress,
  amount
) => {
  const token = await IMintableERC20.at(tokenAddress);
  await token.mint(receiverAddress, amount, {
    from: ownerAddress,
    gasPrice: 0,
  });
};

const transferERC20Tokens = async (
  tokenAddress,
  receiverAddress,
  ownerAddress,
  amount
) => {
  const token = await IMintableERC20.at(tokenAddress);
  await token.transfer(receiverAddress, amount, {
    from: ownerAddress,
    gasPrice: 0,
  });
};

const getERC20Balance = async (contractAddress, accountAddress) => {
  const token = await IMintableERC20.at(contractAddress);
  const balance = await token.balanceOf(accountAddress);
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  console.log(
    `       --->  ${symbol} balance:`,
    balance.toString() / `1e${decimals}`
  );
  return balance;
};

console.debug = function () {
  if (!console.debugging) return;
  console.log.apply(this, arguments);
};

console.debugging = false;

function updateDeployJsons(network, deploy_data) {
  for (let [contract_name, file_path] of Object.entries(DEPLOYS_JSON)) {
    // go through all deploys json and update them
    const address_json = require(file_path);
    // skip over contracts not changed
    if (deploy_data[contract_name] === undefined) {
      continue;
    }
    address_json[CHAIN_IDS[network]] = deploy_data[contract_name];
    const address_json_string = JSON.stringify(address_json, null, "  ");
    fs.writeFileSync(
      __dirname + "/" + file_path,
      address_json_string,
      (err) => {
        if (err) throw err;
      }
    );
  }
}

function getDeployedAddress(contractName, network) {
  const contractAddresses = require(DEPLOYS_JSON[contractName]);
  const deployedAddress = contractAddresses[CHAIN_IDS[network]];
  return deployedAddress;
}

function getStablecoinAddress(symbol, network) {
  const aggItems = TOKEN_AGG_MAP[network.toUpperCase()];
  for (const aggItem of aggItems) {
    if (symbol == aggItem["symbol"]) {
      return aggItem["token"];
    }
  }
  throw new Error(`Could not find address for ${symbol}`);
}

async function getGasPrice(gasPrice, speed = "fastest") {
  /*
  gasPrice must be an integer representing gwei

  speed can be:
  - safeLow
  - average / standard
  - fast
  - fastest
  */
  if (gasPrice) {
    console.log("Using provided gas price (gwei):", gasPrice);
  } else {
    const { data } = await axios.get(
      "https://ethgasstation.info/json/ethgasAPI.json"
    );
    speed = speed.toLowerCase();
    if (speed == "standard") speed = "average";
    if (speed == "safelow") speed = "safeLow";
    gasPrice = data[speed] / 10; // for some reason, result is in 10 * gwei
    console.log(`Using "${speed}" gas price (gwei):`, gasPrice);
  }

  gasPrice = parseInt(gasPrice * 1e9);
  return gasPrice;
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
  await prepareTokenSender(sender, "0.50", ethFunder);
  const fundAccountSigner = await ethers.provider.getSigner(sender);

  const trx = await token
    .connect(fundAccountSigner)
    .transfer(recipient, amount);
  await trx.wait();
  const balance = (await token.balanceOf(recipient)).toString();
  const symbol = await token.symbol();
  console.debug(`${symbol} balance: ${balance / 10 ** decimals}`);
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

const FAKE_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);
const ANOTHER_FAKE_ADDRESS = web3.utils.toChecksumAddress(
  "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
);

module.exports = {
  bytes32,
  dai,
  erc20,
  mintERC20Tokens,
  transferERC20Tokens,
  getERC20Balance,
  undoErc20,
  console,
  updateDeployJsons,
  getDeployedAddress,
  getStablecoinAddress,
  tokenAmountToBigNumber,
  getGasPrice,
  acquireToken,
  ZERO_ADDRESS,
  MAX_UINT256,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
};
