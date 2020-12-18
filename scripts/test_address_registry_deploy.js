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
const { ethers, artifacts, network } = require("hardhat");

const { assert, expect } = require("chai");
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants.js");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON[
  "APYAddressRegistryProxyAdmin"
]);

const main = async () => {
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

  const PROXY_ADDRESSES = require(DEPLOYS_JSON["APYAddressRegistryProxy"]);
  const APYAddressRegistry = await ethers.getContractFactory(
    "APYAddressRegistry"
  );
  let registry = await APYAddressRegistry.attach(
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
  assert.notEqual(await registry.managerAddress(), ZERO_ADDRESS);
  assert.notEqual(await registry.chainlinkRegistryAddress(), ZERO_ADDRESS);
  assert.notEqual(await registry.daiPoolAddress(), ZERO_ADDRESS);
  assert.notEqual(await registry.usdcPoolAddress(), ZERO_ADDRESS);
  assert.notEqual(await registry.usdtPoolAddress(), ZERO_ADDRESS);

  // console.log("Check manager is correct...");
  // const managerAddress = await registry.managerAddress();
  // const token = new ethers.Contract(managerAddress, APYManager.abi).connect(
  //   user
  // );
  // expect(await token.symbol()).to.equal(symbol);
};

main()
  .then((text) => {
    console.log("");
    console.log("Finished with no errors.");
    console.log("");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
