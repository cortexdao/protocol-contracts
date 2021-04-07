const hre = require("hardhat");
const { ethers } = hre;
const { BigNumber } = ethers;
const coingecko = require("./coingecko");

const priceTotalValue = (allocations, quote, data) => {
  return allocations.reduce((acc, t) => {
    const val = BigNumber.from(data[t.symbol].quote[quote].price);
    const coins = BigNumber.from(t.balance).div(
      BigNumber.from(BigNumber.from(10).pow(t.decimals))
    );
    return coins.mul(val).add(acc);
  }, BigNumber.from(0));
};

const getAssetAllocationValue = async (allocations) => {
  const quote = "USD";
  const symbols = allocations.map((t) => t.symbol);
  const data = await coingecko.getPrices(symbols, quote);

  const payloadEntries = symbols.map((symbol) => {
    const key = symbol;
    const val = {
      quote: {
        [quote]: { price: data[symbol] },
      },
    };
    return [key, val];
  });

  const payload = Object.fromEntries(payloadEntries);
  const value = priceTotalValue(allocations, quote, payload);

  return value;
};

module.exports = {
  getAssetAllocationValue,
};
