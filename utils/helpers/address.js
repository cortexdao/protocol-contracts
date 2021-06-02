const fs = require("fs");

const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
  AGG_MAP,
  CONTRACT_NAMES,
} = require("../constants.js");

function getChainId(networkName) {
  networkName = networkName.toUpperCase();
  const chainId = CHAIN_IDS[networkName];
  if (chainId === undefined) {
    throw new Error(`getChainId: unrecognized network name - ${networkName}`);
  }
  return chainId;
}

/**
 * Update the JSONs of deployed addresses based on name and network.
 *
 * @param {string} network Network name in utils/constants.js:CHAIN_IDS
 * @param {object} deployData object mapping contract name to address
 */
function updateDeployJsons(network, deployData) {
  for (const contractName of Object.keys(deployData)) {
    if (!isApyContractName(contractName))
      throw new Error(
        `updateDeployJsons: unrecognized APY contract name - ${contractName}.`
      );
    const filepath = DEPLOYS_JSON[contractName];
    const addressJson = fs.existsSync(filepath) ? require(filepath) : {};
    const chainId = getChainId(network);
    addressJson[chainId] = deployData[contractName];
    const addressJsonString = JSON.stringify(addressJson, null, "  ");
    fs.writeFileSync(filepath, addressJsonString, (err) => {
      if (err) throw err;
    });
  }
}

/**
 * Get the deployed contract address corresponding to the given name
 * and network.
 *
 * @param {string} contractName contract name in utils/constants.js:CONTRACT_NAMES
 * @param {string} network network name in utils/constants.js:CHAIN_IDS
 * @returns contract address
 */
function getDeployedAddress(contractName, network) {
  if (!isApyContractName(contractName))
    throw new Error(
      `getDeployedAddress: unrecognized APY contract name - ${contractName}.`
    );
  const contractAddresses = require(DEPLOYS_JSON[contractName]);
  const chainId = getChainId(network);
  const deployedAddress = contractAddresses[chainId];
  return deployedAddress;
}

function isApyContractName(contractName) {
  return CONTRACT_NAMES.includes(contractName);
}

/**
 * @param {*} symbol token symbol in utils/constants.js:TOKEN_AGG_MAP
 * @param {string} network network name in utils/constants.js:CHAIN_IDS
 * @returns
 */
function getStablecoinAddress(symbol, network) {
  const aggItems = TOKEN_AGG_MAP[network.toUpperCase()];
  for (const aggItem of aggItems) {
    if (symbol.toUpperCase() == aggItem["symbol"]) {
      return aggItem["token"];
    }
  }
  throw new Error(`Could not find address for ${symbol}`);
}

/**
 * @param {*} name aggregator name in utils/constants.js:AGG_MAP
 * @param {string} network network name in utils/constants.js:CHAIN_IDS
 * @returns
 */
function getAggregatorAddress(name, network) {
  const aggAddress = AGG_MAP[network.toUpperCase()][name.toUpperCase()];
  return aggAddress;
}

module.exports = {
  updateDeployJsons,
  getDeployedAddress,
  getStablecoinAddress,
  getAggregatorAddress,
};
