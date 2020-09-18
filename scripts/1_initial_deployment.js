require('dotenv').config();
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);
const chainIdToAggregators = require("../config/addresses.json");

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
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });