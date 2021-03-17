require("dotenv").config();
const hre = require("hardhat");
const { ethers, network } = hre;
const { TOKEN_AGG_MAP } = require("../utils/constants");
const { updateDeployJsons } = require("../utils/helpers");

async function main() {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const PoolToken = await ethers.getContractFactory("PoolToken");
  const PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");

  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);

  let deploy_data = {};
  deploy_data["PoolTokenProxyAdmin"] = proxyAdmin.address;

  for (const { symbol, token, aggregator } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    console.log("");
    console.log(`Deploying contracts for ${symbol}`);
    console.log(`    --> ${aggregator} Chainlink Oracle Agg`);

    const logic = await PoolToken.deploy();
    await logic.deployed();
    console.log(`Implementation Logic: ${logic.address}`);

    const proxy = await PoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      token,
      aggregator
    );
    await proxy.deployed();
    console.log(`Proxy: ${proxy.address}`);

    deploy_data[symbol + "_PoolToken"] = logic.address;
    deploy_data[symbol + "_PoolTokenProxy"] = proxy.address;

    const instance = await PoolToken.attach(proxy.address);
    await instance.lock();
    console.log(`${symbol} pool locked.`);
  }

  updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
