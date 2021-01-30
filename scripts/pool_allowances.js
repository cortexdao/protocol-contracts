require("dotenv").config();
const { ethers, network } = require("hardhat");
const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
} = require("../utils/constants");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const APYPoolTokenProxy = await ethers.getContractFactory(
    "APYPoolTokenProxy"
  );
  const signers = await ethers.getSigners();
  const user = signers[2]; // Account 3 in MetaMask; has necessary tokens

  for (const { symbol, token } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    const APY_LIQUIDITY_POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON[
      symbol + "_APYPoolTokenProxy"
    ]);
    const proxy = await APYPoolTokenProxy.attach(
      APY_LIQUIDITY_POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
    );

    // give pool infinite allowance to test addLiquidity / redeem
    const IERC20 = await ethers.getContractFactory("IERC20");
    const erc20 = await (await IERC20.attach(token)).connect(user);
    await erc20.approve(proxy.address, ethers.constants.MaxUint256);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
