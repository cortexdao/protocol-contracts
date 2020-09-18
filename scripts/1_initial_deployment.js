require('dotenv').config();
const chainIdToAggregators = require("../config/addresses.json");
const fs = require('fs')

const chainIds = {
  MAINNET: '1',
  RINKEBY: '4',
  GOERLI: '5',
  KOVAN: '42',
}

const chainNames = {
  '1': 'MAINNET',
  '4': 'RINKEBY',
  '5': 'GOERLI',
  '42': 'KOVAN',
}

DEPLOYS_JSON = {
  ProxyAdmin: '../deployed_addresses/ProxyAdminAddresses.json',
  APYLiquidityPoolImplementation: '../deployed_addresses/APYLiquidityPoolImplementationAddresses.json',
  APYLiquidityPoolProxy: '../deployed_addresses/APYLiquidityPoolProxyAddresses.json'
}

async function updateDeployJsons(network, deploy_data) {
  for (let [contract_name, file_path] of Object.entries(DEPLOYS_JSON)) {
    // go through all deploys json and update them
    address_json = require(file_path)
    address_json[chainIds[network]] = deploy_data[contract_name]
    address_json_string = JSON.stringify(address_json, null, '  ')
    fs.writeFileSync(__dirname + '/' + file_path, address_json_string, err => {
      if (err) throw err
    })
  }
}

async function main() {
  const networkID = network.name.toUpperCase()
  console.log(`${networkID} selected`)

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin")
  const APYLiquidityPoolImplementation = await ethers.getContractFactory("APYLiquidityPoolImplementation")
  const APYLiquidityPoolProxy = await ethers.getContractFactory("APYLiquidityPoolProxy")

  const proxyAdmin = await ProxyAdmin.deploy()
  await proxyAdmin.deployed()
  console.log(`ProxyAdmin: ${proxyAdmin.address}`)

  const logic = await APYLiquidityPoolImplementation.deploy()
  await logic.deployed()
  console.log(`Implementation Logic: ${logic.address}`)

  const proxy = await APYLiquidityPoolProxy.deploy(logic.address, proxyAdmin.address)
  await proxy.deployed()
  console.log(`Proxy: ${proxy.address}`)

  const instance = await APYLiquidityPoolImplementation.attach(proxy.address)

  await instance.setAdminAddress(proxyAdmin.address)
  console.log(`Instance Admin address set: ${proxyAdmin.address}`)

  for ({ symbol, token, aggregator } of chainIdToAggregators[networkID]) {
    await instance.addTokenSupport(token, aggregator)
    console.log(`${symbol} -> ${aggregator} Chainlink Oracle Agg`)
  }

  //Update Jsons
  let deploy_data = {}
  deploy_data['ProxyAdmin'] = proxyAdmin.address
  deploy_data['APYLiquidityPoolImplementation'] = logic.address
  deploy_data['APYLiquidityPoolProxy'] = proxy.address
  await updateDeployJsons(networkID, deploy_data)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });