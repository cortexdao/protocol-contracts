const fs = require("fs");

const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
  AGG_MAP,
  CONTRACT_NAMES,
} = require("../constants.js");

/**
 * Update the JSONs of deployed addresses based on name and network.
 *
 * @param {string} network Network name in utils/constants.js:CHAIN_IDS
 * @param {object} deploy_data object mapping contract name to address
 */
function updateDeployJsons(network, deploy_data) {
  for (let [contract_name, file_path] of Object.entries(DEPLOYS_JSON)) {
    // go through all deploys json and update them
    const address_json = require(file_path);
    // skip over contracts not changed
    if (deploy_data[contract_name] === undefined) {
      continue;
    }
    address_json[CHAIN_IDS[network]] = deploy_data[contract_name];
    const address_json_string = JSON.stringify(address_json, null, "  ");
    fs.writeFileSync(file_path, address_json_string, (err) => {
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
  const chainId = CHAIN_IDS[network.toUpperCase()];
  if (!chainId)
    throw new Error(
      `getDeployedAddress: unrecognized network name - ${network}.`
    );
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
    if (symbol == aggItem["symbol"]) {
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
