require('dotenv').config();
const { CHAIN_IDS, DEPLOYS_JSON } = require('../utils/constants.js')

const APY_LIQUIDITY_POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON['APYLiquidityPoolProxy'])

async function main() {
  const NETWORK_NAME = network.name.toUpperCase()
  console.log(`${NETWORK_NAME} selected`)

  const APYLiquidityPoolImplementation = await ethers.getContractFactory("APYLiquidityPoolImplementation")
  const APYLiquidityPoolProxy = await ethers.getContractFactory("APYLiquidityPoolProxy")

  const proxy = await APYLiquidityPoolProxy.attach(APY_LIQUIDITY_POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]])
  const instance = await APYLiquidityPoolImplementation.attach(proxy.address)

  // NOTE: pick what you want to do
  // await instance.lock()
  // await instance.unlock()

  // await instance.lockAddLiquidity()
  // await instance.unlockAddLiquidity()

  // await instance.lockRedeem()
  // await instance.unlockRedeem()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });