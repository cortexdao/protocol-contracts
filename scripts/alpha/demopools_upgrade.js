#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const hre = require("hardhat");
const { argv } = require("yargs");
const { ethers, network } = require("hardhat");
const {
  updateDeployJsons,
  getDeployedAddress,
  bytes32,
} = require("../../utils/helpers");
const {
  SafeService,
  SafeEthersSigner,
} = require("@gnosis.pm/safe-ethers-adapters");

const MAINNET_SERVICE_URL = "https://safe-transaction.gnosis.io/";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const signer = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", signer.address);
  console.log("");

  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");
  balance =
    (await ethers.provider.getBalance(signer.address)).toString() / 1e18;
  console.log("ETH balance (Safe signer): %s", balance);
  console.log("");

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const service = new SafeService(MAINNET_SERVICE_URL);
  const safeSigner = await SafeEthersSigner.create(
    adminSafeAddress,
    signer,
    service
  );

  console.log("");
  console.log("Deploying ...");
  console.log("");

  let feeData = await ethers.provider.getFeeData();
  let maxFeePerGas = feeData.maxFeePerGas.mul(85).div(100);
  const maxPriorityFeePerGas = parseInt(2.5e9);

  //const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2", deployer);
  //// Initialize logic storage to block possible attack vector:
  //// attacker may control and selfdestruct the logic contract
  //// if more powerful functionality is added later
  //const poolTokenV2 = await PoolTokenV2.connect(safeSigner).deploy({
  //  maxFeePerGas,
  //  maxPriorityFeePerGas,
  //});

  //const deploy_data = {};
  //deploy_data["PoolTokenV2"] = poolTokenV2.address;
  //updateDeployJsons(networkName, deploy_data);
  //const poolTokenV2Address = poolTokenV2.address;
  const poolTokenV2Address = "0x712441D70782e284E46FEe73382EF70B2760326B";

  // console.log("USER ACTION REQUIRED");
  // console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  // await poolTokenV2.deployed();
  // console.log("Deployed.");

  // const safeTxHash = poolTokenV2.deployTransaction.hash;
  // const safeTxHash =
  //   "0x5cc53ed4b4cfafce16d4454254a5e17e3d18f6ccfd9f5e20f3fba91dece068c2";
  // const txDetails = await service.getSafeTxDetails(safeTxHash);
  // const txHash = txDetails.transactionHash;

  // if (["KOVAN", "MAINNET"].includes(networkName)) {
  //   console.log("Verifying on Etherscan ...");
  //   await ethers.provider.waitForTransaction(txHash, 5); // wait for Etherscan to catch up
  //   await hre.run("verify:verify", {
  //     address: poolTokenV2Address,
  //   });
  //   console.log("");
  // }

  // feeData = await ethers.provider.getFeeData();
  // maxFeePerGas = feeData.maxFeePerGas.mul(85).div(100);

  // const poolTokenV2 = await ethers.getContractAt(
  //   "PoolTokenV2",
  //   poolTokenV2Address
  // );
  // let tx = await poolTokenV2
  //   .connect(safeSigner)
  //   .initialize(
  //     "0x792da6df6bbdcc84c23235a6bef43921d81169b7",
  //     "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  //     "0xcafecafecafecafecafecafecafecafecafecafe",
  //     { maxFeePerGas, maxPriorityFeePerGas }
  //   );
  // console.log("USER ACTION REQUIRED");
  // console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  // await tx.wait();
  // console.log("Initialized.");

  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    "0x792da6df6bbdcc84c23235a6bef43921d81169b7"
  );

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );

  //   feeData = await ethers.provider.getFeeData();
  //   maxFeePerGas = feeData.maxFeePerGas.mul(85).div(100);
  //
  //   const daiPoolAddress = await addressRegistry.getAddress(
  //     bytes32("daiDemoPool")
  //   );
  //   tx = await proxyAdmin
  //     .connect(safeSigner)
  //     .upgrade(daiPoolAddress, poolTokenV2Address, {
  //       maxFeePerGas,
  //       maxPriorityFeePerGas,
  //     });
  //   console.log("USER ACTION REQUIRED");
  //   console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  //   await tx.wait();

  feeData = await ethers.provider.getFeeData();
  maxFeePerGas = feeData.maxFeePerGas.mul(85).div(100);

  const usdcPoolAddress = await addressRegistry.getAddress(
    bytes32("usdcDemoPool")
  );
  const tx = await proxyAdmin
    .connect(safeSigner)
    .upgrade(usdcPoolAddress, poolTokenV2Address, {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
  console.log("USER ACTION REQUIRED");
  console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  await tx.wait();

  //   feeData = await ethers.provider.getFeeData();
  //   maxFeePerGas = feeData.maxFeePerGas.mul(85).div(100);
  //
  //   const usdtPoolAddress = await addressRegistry.getAddress(
  //     bytes32("usdtDemoPool")
  //   );
  //   tx = await proxyAdmin
  //     .connect(safeSigner)
  //     .upgrade(usdtPoolAddress, poolTokenV2Address, {
  //       maxFeePerGas,
  //       maxPriorityFeePerGas,
  //     });
  //   console.log("USER ACTION REQUIRED");
  //   console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  //   await tx.wait();
  //
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
