require("dotenv").config();
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
  const APYPoolTokenProxy = await ethers.getContractFactory(
    "APYPoolTokenProxy"
  );

  // NOTE: first specify which pool, using the underlyer symbol
  const symbol;
  const APY_LIQUIDITY_POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON[
    symbol + "_APYPoolTokenProxy"
  ]);
  const proxy = await APYPoolTokenProxy.attach(
    APY_LIQUIDITY_POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );
  const instance = await APYPoolToken.attach(proxy.address);

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
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
