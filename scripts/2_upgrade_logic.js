require('dotenv').config();
const { CHAIN_IDS, TOKEN_AGG_MAP } = require('../utils/constants.js')

async function main() {
  const networkID = network.name.toUpperCase()
  console.log(`${networkID} selected`)

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin")
  // NOTE: update the contract name
  // const APYLiquidityPoolImplementation = await ethers.getContractFactory("APYLiquidityPoolImplementation")
  const APYLiquidityPoolProxy = await ethers.getContractFactory("APYLiquidityPoolProxy")

  const proxyAdmin = await ProxyAdmin.attach('')

  // NOTE: update the contract name
  // const newLogic = await APYLiquidityPoolImplementation.deploy()
  await newLogic.deployed()
  console.log(`New Implementation Logic: ${newLogic.address}`)

  const proxy = await APYLiquidityPoolProxy.attach('')

  const iImplementation = new ethers.utils.Interface(APYLiquidityPoolImplementationUpgraded.abi);
  const initData = iImplementation.encodeFunctionData("initializeUpgrade", [])

  // NOTE: Select 1 of the following
  // await proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)
  // await proxyAdmin.upgrade(proxy.address, newLogic.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });