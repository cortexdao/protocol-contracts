const { ether, BN } = require("@openzeppelin/test-helpers");
const IMintableERC20 = artifacts.require("IMintableERC20");

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
  //   console.debug(
  //     "whole:",
  //     wholePart.toString(),
  //     "base:",
  //     base.toString(),
  //     "frac:",
  //     fracPart.toString()
  //   );
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

module.exports = {
  dai,
  erc20,
  mintERC20Tokens,
  getERC20Balance,
  undoErc20,
};
