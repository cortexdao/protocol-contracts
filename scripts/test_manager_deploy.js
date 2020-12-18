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

const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON["APYManagerProxyAdmin"]);
const PROXY_ADDRESSES = require(DEPLOYS_JSON["APYManagerProxy"]);

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
  console.log("");

  let admin = await ethers.getContractAt(
    "ProxyAdmin",
    PROXY_ADMIN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );
  admin = admin.connect(user);

  let manager = await ethers.getContractAt(
    "APYManager",
    PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );
  manager = manager.connect(user);

  console.log("");
  console.log("Start tests for manager");
  console.log("");

  // 1. check admin address is set on the proxy, both ways:
  //    a. set in the admin slot in proxy, so it works
  //    b. set in logic contract's portion of storage, to protect the initializer
  // 2. check logic address is set on the proxy
  console.log(
    "Check admin address set in both unstructured and structured storage..."
  );
  expect(await admin.getProxyAdmin(manager.address)).to.equal(admin.address);
  expect(await manager.proxyAdmin()).to.equal(admin.address);
  console.log("Check logic address is set on proxy...");
  const MANAGER_ADDRESSES = require(DEPLOYS_JSON["APYManager"]);
  expect(await admin.getProxyImplementation(manager.address)).to.equal(
    MANAGER_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );

  console.log("Check logic is accessible through the proxy...");
  const tokenAddresses = await manager.getTokenAddresses();
  assert.lengthOf(tokenAddresses, 3);
  const poolName_0 = await manager.poolNames(0);
  const poolName_1 = await manager.poolNames(1);
  const poolName_2 = await manager.poolNames(2);
  const poolAddress_0 = await manager.pools(poolName_0);
  const poolAddress_1 = await manager.pools(poolName_1);
  const poolAddress_2 = await manager.pools(poolName_2);

  console.log("");
  console.log("Token addresses:", tokenAddresses);
  console.log("");

  let pool = await ethers.getContractAt("APYPoolToken", poolAddress_0);
  let underlyer = await pool.underlyer();
  let token = await ethers.getContractAt("IDetailedERC20", underlyer);
  console.log("Token symbol:", await token.symbol());

  pool = await ethers.getContractAt("APYPoolToken", poolAddress_1);
  underlyer = await pool.underlyer();
  token = await ethers.getContractAt("IDetailedERC20", underlyer);
  console.log("Token symbol:", await token.symbol());

  pool = await ethers.getContractAt("APYPoolToken", poolAddress_2);
  underlyer = await pool.underlyer();
  token = await ethers.getContractAt("IDetailedERC20", underlyer);
  console.log("Token symbol:", await token.symbol());
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
