require("dotenv").config();
const { ethers, network } = require("hardhat");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const PoolToken = await ethers.getContractFactory("PoolToken");
  const PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");

  // NOTE: first specify which pool, using the underlyer symbol
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const LIQUIDITY_POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON[
      symbol + "_PoolTokenProxy"
    ]);
    const proxy = await PoolTokenProxy.attach(
      LIQUIDITY_POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
    );
    const instance = await PoolToken.attach(proxy.address);

    if (await instance.paused()) {
      await instance.unlock();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
