const fs = require("fs");

const { CHAIN_IDS, DEPLOYS_JSON, TOKEN_AGG_MAP } = require("../constants.js");

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

function getDeployedAddress(contractName, network) {
  const contractAddresses = require(DEPLOYS_JSON[contractName]);
  const deployedAddress = contractAddresses[CHAIN_IDS[network]];
  return deployedAddress;
}

function getStablecoinAddress(symbol, network) {
  const aggItems = TOKEN_AGG_MAP[network.toUpperCase()];
  for (const aggItem of aggItems) {
    if (symbol == aggItem["symbol"]) {
      return aggItem["token"];
    }
  }
  throw new Error(`Could not find address for ${symbol}`);
}

module.exports = {
  updateDeployJsons,
  getDeployedAddress,
  getStablecoinAddress,
};
