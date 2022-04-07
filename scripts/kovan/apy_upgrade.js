#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs").option("compile", {
  type: "boolean",
  default: true,
  description: "Compile contract using `compile:one`",
});
const hre = require("hardhat");
const { tokenAmountToBigNumber } = require("../../utils/helpers");
const { ethers, network } = hre;

// kovan
const GOV_TOKEN_ADDRESS = "0x63FD300bDF6EB55ee7Bf7e38F54Df8Adf16Dc8f5";
const PROXY_ADMIN_ADDRESS = "0x42e945b72679569e7d825ed1a0dd3ae9e48ca561";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const TOKEN_MNEMONIC = process.env.KOVAN_TOKEN_MNEMONIC;
  if (!TOKEN_MNEMONIC) {
    throw new Error("Must set TOKEN_MNEMONIC env var.");
  }
  const apyTokenDeployer = ethers.Wallet.fromMnemonic(TOKEN_MNEMONIC).connect(
    ethers.provider
  );
  console.log("APY Token deployer:", apyTokenDeployer.address);
  const balance =
    (await ethers.provider.getBalance(apyTokenDeployer.address)).toString() /
    1e18;
  console.log("ETH balance (token deployer): %s", balance);

  const contractName = "GovernanceTokenV2";
  console.log(`${contractName} deploy`);
  console.log("");

  if (argv.compile) {
    console.log(" Compiling ...");
    await hre.run("clean");
    await hre.run("compile");
    await hre.run("compile:one", { contractName });
  }

  console.log("Deploying ... ");
  console.log("");

  const contractFactory = await ethers.getContractFactory(contractName);
  const logicV2 = await contractFactory.connect(apyTokenDeployer).deploy();
  await logicV2.deployTransaction.wait(5);
  console.log("Contract address: %s", logicV2.address);

  console.log("Verifying on Etherscan ...");
  await hre.run("verify:verify", {
    address: logicV2.address,
  });

  console.log("Initializing logic contract ...");
  const totalSupply = tokenAmountToBigNumber("100000000");
  let tx = await logicV2
    .connect(apyTokenDeployer)
    .initialize(PROXY_ADMIN_ADDRESS, totalSupply);
  await tx.wait(2);

  console.log("Upgrading proxy ...");
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    PROXY_ADMIN_ADDRESS
  );
  tx = await proxyAdmin
    .connect(apyTokenDeployer)
    .upgrade(GOV_TOKEN_ADDRESS, logicV2.address);
  await tx.wait();
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Contract upgraded.");
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
