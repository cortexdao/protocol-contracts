const hre = require("hardhat");
const { ethers } = hre;
const { BigNumber } = ethers;

const { ether, BN } = require("@openzeppelin/test-helpers");

const bytes32 = ethers.utils.formatBytes32String;

const dai = ether;

const erc20 = (amount, decimals) => {
  amount = amount.toString();
  if (decimals == undefined) decimals = "18";
  decimals = decimals.toString();
  let [wholePart, fracPart] = amount.split(".");
  fracPart = fracPart || "0";
  if (fracPart != "0" && fracPart.length > decimals) {
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

module.exports = {
  bytes32,
  dai,
  erc20,
  undoErc20,
  tokenAmountToBigNumber,
};
