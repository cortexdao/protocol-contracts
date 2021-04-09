const { Decimal } = require("decimal.js");
const coingecko = require("./coingecko");

const priceTotalValue = (allocations, quote, data) => {
  return allocations
    .reduce((acc, t) => {
      const val = data[t.symbol].quote[quote].price;
      const coins = new Decimal(t.balance.toString()).div(10 ** t.decimals);
      return acc.add(coins.mul(val));
    }, new Decimal(0))
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
