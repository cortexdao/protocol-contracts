const hre = require("hardhat");
const { ethers } = hre;
const { BigNumber: BN } = ethers;
const coingecko = require("./coingecko");

const priceTotalValue = (allocations, quote, data) => {
  console.log(allocations);
  const returnVal = allocations.reduce((acc, t) => {
    const val = BN.from(data[t.symbol].quote[quote].price);
    console.log(`coin val: ${val.toString()}`);
    const coins = BN.from(t.balance).div(BN.from(BN.from(10).pow(t.decimals)));
    console.log(`num coins: ${coins.toString()}`);
    const abc = coins.mul(val).add(acc);
    return abc;
  }, BN.from(0));
  console.log(`total coin val: ${returnVal.toString()}`);
  return returnVal;
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
  console.log(JSON.stringify(payload));
  const value = priceTotalValue(allocations, quote, payload);

  return value;
};

module.exports = {
  getAssetAllocationValue,
};
