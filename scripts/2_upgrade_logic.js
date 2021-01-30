require("dotenv").config();
const { artifacts, ethers, network } = require("hardhat");
const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
} = require("../utils/constants");
const { updateDeployJsons } = require("../utils/helpers");

const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON["APYPoolTokenProxyAdmin"]);

const ContractData = artifacts.require("APYPoolToken");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
  const APYPoolTokenProxy = await ethers.getContractFactory(
    "APYPoolTokenProxy"
  );

  const proxyAdmin = await ProxyAdmin.attach(
    PROXY_ADMIN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );

  for (const { symbol } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    const newLogic = await APYPoolToken.deploy();
    await newLogic.deployed();
    console.log(`New Implementation Logic: ${newLogic.address}`);

    const APY_LIQUIDITY_POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON[
      symbol + "_APYPoolTokenProxy"
    ]);
    const proxy = await APYPoolTokenProxy.attach(
      APY_LIQUIDITY_POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
    );

    const iImplementation = new ethers.utils.Interface(ContractData.abi);
    const initData = iImplementation.encodeFunctionData(
      "initializeUpgrade",
      []
    );

    // NOTE: Select 1 of the following
    await proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData);
    // await proxyAdmin.upgrade(proxy.address, newLogic.address)

    //Update Jsons
    let deploy_data = {};
    deploy_data[symbol + "_APYPoolToken"] = newLogic.address;
    await updateDeployJsons(NETWORK_NAME, deploy_data);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
