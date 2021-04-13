const axios = require("axios");

class Requester {
  static async request(config, retries = 3, delay = 1000) {
    if (typeof config === "string") config = { url: config };
    if (typeof config.timeout === "undefined") {
      const timeout = Number(process.env.TIMEOUT);
      config.timeout = !isNaN(timeout) ? timeout : 3000;
    }

    const _retry = async (n) => {
      const _delayRetry = async (message) => {
        console.warn(message);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await _retry(n - 1);
      };

      let response;
      try {
        response = await axios(config);
      } catch (error) {
        // Request error
        if (n === 1) {
          console.error(
            `Could not reach endpoint: ${JSON.stringify(error.message)}`
          );
          throw new Error({ message: error.message, cause: error });
        }

        return await _delayRetry(
          `Caught error. Retrying: ${JSON.stringify(error.message)}`
        );
      }

      if (response.data.error) {
        // Response error
        if (n === 1) {
          const message = `Could not retrieve valid data: ${JSON.stringify(
            response.data
          )}`;
          console.error(message);
          const cause = response.data.error;
          throw new Error({ message, cause });
        }

        return await _delayRetry(
          `Error in response. Retrying: ${JSON.stringify(response.data)}`
        );
      }

      // Success
      const { data, status, statusText } = response;
      console.debug({
        message: "Received response",
        data,
        status,
        statusText,
      });
      return response;
    };

    return await _retry(retries);
  }
}

const getCoinList = async () => {
  const url = "https://api.coingecko.com/api/v3/coins/list";
  const config = {
    url,
  };
  const response = await Requester.request(config);
  return response.data;
};

const getPriceData = async (ids, currency, marketcap = false) => {
  const url = "https://api.coingecko.com/api/v3/simple/price";
  const params = {
    ids,
    vs_currencies: currency.toLowerCase(),
    include_market_cap: marketcap,
  };
  const config = {
    url,
    params,
  };
  const response = await Requester.request(config);
  return response.data;
};

const coingeckoBlacklist = [
  "leocoin",
  "farmatrust",
  "freetip",
  "compound-coin",
  "uni-coin",
  "unicorn-token",
];

const toAssetPrice = (data, currency) => {
  const price = data && data[currency.toLowerCase()];
  if (!price || price <= 0) {
    throw new Error("invalid price");
  }
  return price;
};

const getPrices = async (baseSymbols, quote) => {
  const coinList = await getCoinList();
  const idToSymbol = getIdtoSymbol(baseSymbols, coinList);
  const ids = Object.keys(idToSymbol).join(",");
  const response = await getPriceData(ids, quote);
  return Object.fromEntries(
    Object.entries(response).map(([coinId, data]) => [
      idToSymbol[coinId],
      toAssetPrice(data, quote),
    ])
  );
};

const getIdtoSymbol = (symbols, coinList) => {
  const idToSymbol = {};
  symbols.forEach((symbol) => {
    const coin = coinList.find(
      (d) =>
        d.symbol.toLowerCase() === symbol.toLowerCase() &&
        !coingeckoBlacklist.includes(d.id.toLowerCase())
    );
    if (coin && coin.id) {
      idToSymbol[coin.id] = symbol;
    }
  });
  return idToSymbol;
};

module.exports = {
  getCoinList,
  getPriceData,
  toAssetPrice,
  getPrices,
  getIdtoSymbol,
};
