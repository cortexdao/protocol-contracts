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
const {
  getAggregatorAddress,
  getDeployedAddress,
} = require("../../utils/helpers");

async function main() {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Deployer address:", await deployer.getAddress());

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYMetaPoolToken = await ethers.getContractFactory("APYMetaPoolToken");
  const APYMetaPoolTokenProxy = await ethers.getContractFactory(
    "APYMetaPoolTokenProxy"
  );
  const APYPoolTokenV2 = await ethers.getContractFactory("APYPoolTokenV2");

  const proxyAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const proxyAdmin = await ProxyAdmin.attach(proxyAdminAddress);
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);
  console.log("");

  // need to impersonate (and fund) pool owner
  // so we can upgrade the proxy to V2 logic
  const ownerAddress = await proxyAdmin.owner();
  const owner = await ethers.provider.getSigner(ownerAddress);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ownerAddress],
  });
  await deployer.sendTransaction({
    to: ownerAddress,
    value: ethers.utils.parseEther("10").toHexString(),
  });

  console.log("");
  console.log("Deploying mAPT ...");
  console.log("");
  const mAptLogic = await APYMetaPoolToken.deploy();
  await mAptLogic.deployed();

  const tvlAggAddress = getAggregatorAddress("TVL", NETWORK_NAME);
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
  console.log("ETH-USD Aggregator:", ethUsdAggAddress);
  console.log("TVL Aggregator:", tvlAggAddress);
  console.log("Aggregator stale period:", aggStalePeriod);
  console.log("");
  console.log("... done.");
  console.log("");

  console.log("");
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    console.log(`Upgrading ${symbol} pool ...`);
    const poolAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    console.log(`${symbol} APT: ${poolAddress}`);

    const logicV2 = await APYPoolTokenV2.deploy();
    await logicV2.deployed();
    const initData = APYPoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [mAptProxy.address]
    );
    await proxyAdmin
      .connect(owner)
      .upgradeAndCall(poolAddress, logicV2.address, initData);
    console.log("... done.");
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
