/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { ethers, network } = require("hardhat");
const { argv } = require("yargs");
const { assert, expect } = require("chai");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");

const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON[
  "APYAddressRegistryProxyAdmin"
]);
const PROXY_ADDRESSES = require(DEPLOYS_JSON["APYAddressRegistryProxy"]);

// eslint-disable-next-line no-unused-vars
const main = async (argv) => {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Account 0 (deployer):", await deployer.getAddress());

  // pick random user, not used for something else
  const user = signers[8];
  console.log("Account 8 (user):", await user.getAddress());

  let admin = await ethers.getContractAt(
    "ProxyAdmin",
    PROXY_ADMIN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );
  admin = admin.connect(user);

  let registry = await ethers.getContractAt(
    "APYAddressRegistry",
    PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );
  registry = registry.connect(user);

  console.log("");
  console.log("Start tests for address registry");
  console.log("");

  // 1. check admin address is set on the proxy, both ways:
  //    a. set in the admin slot in proxy, so it works
  //    b. set in logic contract's portion of storage, to protect the initializer
  // 2. check logic address is set on the proxy
  console.log(
    "Check admin address set in both unstructured and structured storage..."
  );
  expect(await admin.getProxyAdmin(registry.address)).to.equal(admin.address);
  expect(await registry.proxyAdmin()).to.equal(admin.address);
  console.log("Check logic address is set on proxy...");
  const REGISTRY_ADDRESSES = require(DEPLOYS_JSON["APYAddressRegistry"]);
  expect(await admin.getProxyImplementation(registry.address)).to.equal(
    REGISTRY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );

  console.log("Check logic is accessible through the proxy...");
  const managerAddress = await registry.managerAddress();
  const chainlinkRegistryAddress = await registry.chainlinkRegistryAddress();
  const daiPoolAddress = await registry.daiPoolAddress();
  const usdcPoolAddress = await registry.usdcPoolAddress();
  const usdtPoolAddress = await registry.usdtPoolAddress();

  console.log("Check manager address is correct...");
  const manager = ethers
    .getContractAt("APYManager", managerAddress)
    .connect(user);
  assert.deepEqual(await manager.poolNames(), [
    "daiPool",
    "usdcPool",
    "usdtPool",
  ]);

  console.log("Check chainlink registry address is the same as manager...");
  expect(managerAddress).to.equal(chainlinkRegistryAddress);

  console.log("Check DAI pool address is correct...");
  const daiPool = ethers
    .getContractAt("APYPoolToken", daiPoolAddress)
    .connect(user);
  const daiAddress = await daiPool.underlyer();
  const dai = await ethers.getContractAt("IDetailedERC20", daiAddress);
  expect(await dai.symbol()).to.equal("DAI");

  console.log("Check USDC pool address is correct...");
  const usdcPool = ethers
    .getContractAt("APYPoolToken", usdcPoolAddress)
    .connect(user);
  const usdcAddress = await usdcPool.underlyer();
  const usdc = await ethers.getContractAt("IDetailedERC20", usdcAddress);
  expect(await usdc.symbol()).to.equal("USDC");

  console.log("Check USDT pool address is correct...");
  const usdtPool = ethers
    .getContractAt("APYPoolToken", usdtPoolAddress)
    .connect(user);
  const usdtAddress = await usdtPool.underlyer();
  const usdt = await ethers.getContractAt("IDetailedERC20", usdtAddress);
  expect(await usdt.symbol()).to.equal("USDT");
};

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Finished with no errors.");
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
