require('dotenv').config();
const { CHAIN_IDS, TOKEN_AGG_MAP } = require('../utils/constants.js')

async function main() {
  const networkID = network.name.toUpperCase()
  console.log(`${networkID} selected`)

  const APYLiquidityPoolImplementation = await ethers.getContractFactory("APYLiquidityPoolImplementation")
  const APYLiquidityPoolProxy = await ethers.getContractFactory("APYLiquidityPoolProxy")

  const proxy = await APYLiquidityPoolProxy.attach('')
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