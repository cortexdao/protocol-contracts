#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 *
 *
 * This script will deploy the stablecoin pools along with the mAPT token.
 */
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { TOKEN_AGG_MAP } = require("../../utils/constants");
const { getAggregatorAddress } = require("../../utils/helpers");

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
  console.log("Deploying ...");
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYMetaPoolToken = await ethers.getContractFactory("APYMetaPoolToken");
  const APYMetaPoolTokenProxy = await ethers.getContractFactory(
    "APYMetaPoolTokenProxy"
  );
  const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
  const APYPoolTokenV2 = await ethers.getContractFactory("APYPoolTokenV2");
  const APYPoolTokenProxy = await ethers.getContractFactory(
    "APYPoolTokenProxy"
  );

  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);
  console.log("");

  const mAptLogic = await APYMetaPoolToken.deploy();
  await mAptLogic.deployed();

  const tvlAggAddress = getAggregatorAddress("TVL", NETWORK_NAME); // this will return fake address
  const ethUsdAggAddress = getAggregatorAddress("ETH-USD", NETWORK_NAME);
  const aggStalePeriod = 14400;
  const mAptProxy = await APYMetaPoolTokenProxy.deploy(
    mAptLogic.address,
    proxyAdmin.address,
    tvlAggAddress,
    ethUsdAggAddress,
    aggStalePeriod
  );
  await mAptProxy.deployed();
  console.log(`mAPT: ${mAptProxy.address}`);
  console.log("");

  console.log("");
  console.log("ETH-USD Aggregator:", ethUsdAggAddress);
  console.log("TVL Aggregator:", tvlAggAddress);
  console.log("");
  console.log("Aggregator stale period:", aggStalePeriod);
  console.log("");

  for (const { symbol, token, aggregator } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    console.log("");
    console.log("Deploying APT contracts...");
    console.log("");

    const logic = await APYPoolToken.deploy();
    await logic.deployed();
    const proxy = await APYPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      token,
      aggregator
    );
    await proxy.deployed();

    const logicV2 = await APYPoolTokenV2.deploy();
    await logicV2.deployed();
    const initData = APYPoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [mAptProxy.address]
    );
    await proxyAdmin.upgradeAndCall(proxy.address, logicV2.address, initData);

    console.log(`${symbol} APT: ${proxy.address}`);
  }
}

if (!module.parent) {
  main()
    .then(() => {
      console.log("");
      console.log("Deployment successful.");
      console.log("");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
