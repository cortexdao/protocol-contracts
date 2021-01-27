const axios = require("axios");

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

module.exports = {
  getGasPrice,
};
