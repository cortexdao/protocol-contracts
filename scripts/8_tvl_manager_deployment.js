#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node run scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network, artifacts } = require("hardhat");
const assert = require("assert");
const chalk = require("chalk");
const {
  getGasPrice,
  updateDeployJsons,
  getDeployedAddress,
  bytes32,
  FAKE_ADDRESS,
  getStablecoinAddress,
} = require("../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const TVL_MANAGER_MNEMONIC = process.env.TVL_MANAGER_MNEMONIC;
  const managerDeployer = ethers.Wallet.fromMnemonic(
    TVL_MANAGER_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", registryDeployer.address);
  /* TESTING on localhost only
   * may need to fund if ETH runs out while testing
   */
  // if (NETWORK_NAME == "LOCALHOST") {
  //   const [funder] = await ethers.getSigners();
  //   const fundingTrx = await funder.sendTransaction({
  //     to: managerDeployer.address,
  //     value: ethers.utils.parseEther("10.0"),
  //   });
  //   await fundingTrx.wait();
  // }

  let balance =
    (await ethers.provider.getBalance(managerDeployer.address)).toString() /
    1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying TVLManager ...");
  console.log("");

  const TVLManager = await ethers.getContractFactory(
    "TVLManager",
    registryDeployer
  );

  let gasPrice = await getGasPrice(argv.gasPrice);
  // since the real manager is not deployed yet, we pass in a fake address;
  // the owner/deployer can still add or remove allocations.
  const manager = await TVLManager.deploy(FAKE_ADDRESS, {
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${manager.deployTransaction.hash}`
  );
  await manager.deployed();
  console.log("TVLManager:", chalk.green(manager.address));
  console.log("");
  assert.strictEqual(await manager.owner(), managerDeployer.address);

  const deploy_data = {
    TVLManager: manager.address,
  };
  updateDeployJsons(NETWORK_NAME, deploy_data);

  console.log("");
  console.log("Register address for chainlink registry ...");
  console.log("");
  const addressRegistryAddress = getDeployedAddress(
    "APYAddressRegistryProxy",
    NETWORK_NAME
  );
  console.log("Address registry:", addressRegistryAddress);
  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistry = await ethers.getContractAt(
    "APYAddressRegistry",
    addressRegistryAddress,
    addressRegistryDeployer
  );
  console.log(
    "Address Registry Deployer address:",
    addressRegistryDeployer.address
  );
  balance =
    (
      await ethers.provider.getBalance(addressRegistryDeployer.address)
    ).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistry.registerAddress(
    bytes32("chainlinkRegistry"),
    manager.address,
    { gasPrice }
  );
  console.log("Register address:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  assert.strictEqual(
    await addressRegistry.chainlinkRegistryAddress(),
    manager.address,
    "Chainlink registry address is not registered correctly."
  );
  console.log("... done.");

  console.log("");
  console.log("Register allocations for mainnet testing ...");
  console.log("");

  const ifaceERC20 = new ethers.utils.Interface(
    artifacts.require("IDetailedERC20").abi
  );
  const daiPoolAddress = await addressRegistry.daiPoolAddress();
  const calldataForDai = ifaceERC20.encodeFunctionData("balanceOf(address)", [
    daiPoolAddress,
  ]);
  const daiAddress = getStablecoinAddress("DAI", NETWORK_NAME);

  const usdcPoolAddress = await addressRegistry.usdcPoolAddress();
  const calldataForUsdc = ifaceERC20.encodeFunctionData("balanceOf(address)", [
    usdcPoolAddress,
  ]);
  const usdcAddress = getStablecoinAddress("USDC", NETWORK_NAME);

  const usdtPoolAddress = await addressRegistry.usdtPoolAddress();
  const calldataForUsdt = ifaceERC20.encodeFunctionData("balanceOf(address)", [
    usdtPoolAddress,
  ]);
  const usdtAddress = getStablecoinAddress("USDT", NETWORK_NAME);

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await manager.addAssetAllocation(
    bytes32("daiPool"),
    [daiAddress, calldataForDai],
    "DAI",
    18,
    { gasPrice }
  );
  console.log("Add allocation:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await manager.addAssetAllocation(
    bytes32("usdcPool"),
    [usdcAddress, calldataForUsdc],
    "USDC",
    6,
    { gasPrice }
  );
  console.log("Add allocation:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await manager.addAssetAllocation(
    bytes32("usdtPool"),
    [usdtAddress, calldataForUsdt],
    "USDT",
    6,
    { gasPrice }
  );
  console.log("Add allocation:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  console.log("... done.");
  console.log(await manager.getAssetAllocationIds());

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      manager.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: manager.address,
      constructorArguments: [FAKE_ADDRESS],
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
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
