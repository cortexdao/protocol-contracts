const { BN } = require("@openzeppelin/test-helpers");
const coingecko = require("./coingecko");

const priceTotalValue = (allocations, quote, data) => {
  return allocations
    .reduce((acc, t) => {
      const val = new BN(data[t.symbol].quote[quote].price);
      const coins = new BN(t.balance.toString(10)).div(
        new BN(10 ** t.decimals)
      );
      return coins.mul(val).add(acc);
    }, new BN(0))
    .toNumber();
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
