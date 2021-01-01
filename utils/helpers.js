const { artifacts, ethers } = require("hardhat");
const { ether, BN } = require("@openzeppelin/test-helpers");
const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
} = require("../utils/constants.js");
const fs = require("fs");
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
};
