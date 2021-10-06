const axios = require("axios");
const chalk = require("chalk");
const hre = require("hardhat");
const { ethers } = hre;
const { BigNumber } = ethers;

// Current Ethers default logic is to take
//    maxFeePerGas = block.baseFeePerGas.mul(2).add(maxPriorityFeePerGas);
// See:
// https://github.com/ethers-io/ethers.js/blob/da4e107268b380a844dc6d303d28f957a2bd4c88/packages/abstract-provider/src.ts/index.ts#L242
async function getMaxFee(maxFeePerGas) {
  if (maxFeePerGas) {
    console.log(
      "Using provided max fee (gwei): %s",
      chalk.yellow(maxFeePerGas)
    );
    maxFeePerGas = BigNumber.from(maxFeePerGas * 1e9);
  } else {
    const feeData = await ethers.provider.getFeeData(); // values are BigNumber and in wei, not gwei
    maxFeePerGas = feeData.maxFeePerGas;
    console.log(
      "Max fee (gwei): %s",
      chalk.yellow(maxFeePerGas.toString() / 1e9)
    );
  }
  return maxFeePerGas;
}

async function getMaxPriorityFee(maxPriorityFeePerGas) {
  if (maxPriorityFeePerGas) {
    console.log(
      "Using provided max fee (gwei): %s",
      chalk.yellow(maxPriorityFeePerGas)
    );
    maxPriorityFeePerGas = BigNumber.from(maxPriorityFeePerGas * 1e9);
  } else {
    const feeData = await ethers.provider.getFeeData(); // values are BigNumber and in wei, not gwei
    maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    console.log(
      "Max priority fee (gwei): %s",
      chalk.yellow(maxPriorityFeePerGas.toString() / 1e9)
    );
  }
  return maxPriorityFeePerGas;
}

async function getGasPrice(gasPrice, speed = "rapid", source = "gasnow") {
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
  } else if (source == "gasnow") {
    const resp = await axios.get("https://www.gasnow.org/api/v3/gas/price");
    // data: {"code":200,"data":{"rapid":91000000000,"fast":88000000000,"standard":82000000000,"slow":78100000000,"timestamp":1618519348926}}
    const data = resp.data.data;
    speed = speed.toLowerCase();
    if (speed == "fastest") speed = "rapid";
    if (speed == "average") speed = "standard";
    if (speed == "safelow") speed = "slow";
    gasPrice = data[speed] / 1e9;
    console.log(`Using "${speed}" gas price (gwei):`, gasPrice);
  } else if (source == "ethgasstation") {
    const resp = await axios.get(
      "https://ethgasstation.info/json/ethgasAPI.json"
    );
    const data = resp.data;
    // data: {"fast": 730.0, "fastest": 760.0, "safeLow": 10.0, "average": 670.0, "block_time": 12.435483870967742, "blockNum": 12244001, "speed": 0.9990051905308363, "safeLowWait": 19.5, "avgWait": 3.7, "fastWait": 0.4, "fastestWait": 0.4, "gasPriceRange": {"760": 0.4, "740": 0.4, "720": 0.5, "700": 0.7, "680": 2.6, "660": 5.8, "640": 7.2, "620": 7.2, "600": 7.2, "580": 7.2, "560": 7.2, "540": 7.2, "520": 7.2, "500": 7.2, "480": 7.2, "460": 7.2, "440": 7.2, "420": 7.2, "400": 7.2, "380": 7.2, "360": 7.2, "340": 7.2, "320": 7.2, "300": 7.6, "280": 7.6, "260": 7.6, "240": 7.6, "220": 7.6, "200": 7.6, "190": 7.6, "180": 7.6, "170": 7.6, "160": 7.6, "150": 7.6, "140": 7.6, "130": 7.6, "120": 7.6, "110": 7.6, "100": 7.6, "90": 18.4, "80": 18.4, "70": 18.4, "60": 18.4, "50": 19.5, "40": 19.5, "30": 19.5, "20": 19.5, "10": 19.5, "8": 207.3, "6": 207.3, "4": 207.3, "730": 0.4, "670": 3.7}}
    speed = speed.toLowerCase();
    if (speed == "rapid") speed = "fastest";
    if (speed == "standard") speed = "average";
    if (speed == "safelow") speed = "safeLow";
    if (speed == "slow") speed = "safeLow";
    gasPrice = data[speed] / 10; // for some reason, result is in 10 * gwei
    console.log(`Using "${speed}" gas price (gwei):`, gasPrice);
  } else {
    throw new Error("getGasPrice: 'source' not recognized.");
  }

  gasPrice = parseInt(gasPrice * 1e9);
  return gasPrice;
}

module.exports = {
  getGasPrice,
  getMaxFee,
  getMaxPriorityFee,
};
