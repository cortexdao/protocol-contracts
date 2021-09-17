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
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { BigNumber } = ethers;
const chalk = require("chalk");
const { getGasPrice, updateDeployJsons } = require("../../utils/helpers");
const fs = require("fs");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const deployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", deployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: deployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const AlphaDeployment = await ethers.getContractFactory(
    "AlphaDeployment",
    deployer
  );

  const deploy_data = {};
  let gasUsed = BigNumber.from("0");
  let gasPrice = await getGasPrice(argv.gasPrice);

  const factoryNames = [
    "ProxyAdminFactory",
    "ProxyFactory",
    "AddressRegistryV2Factory",
    "MetaPoolTokenFactory",
    "PoolTokenV1Factory",
    "PoolTokenV2Factory",
    "TvlManagerFactory",
    "OracleAdapterFactory",
    "LpAccountFactory",
  ];
  const factoryAddresses = [];

  for (const name of factoryNames) {
    console.log("Deploying %s ...", name);
    const contractFactory = await ethers.getContractFactory(name, deployer);
    const contract = await contractFactory.deploy();
    console.log(
      "Deploy:",
      `https://etherscan.io/tx/${contract.deployTransaction.hash}`
    );
    const receipt = await contract.deployTransaction.wait();
    gasUsed = gasUsed.add(receipt.gasUsed);
    console.log("  ... done.");

    factoryAddresses.push(contract.address);
  }
  const addressesJson = JSON.stringify(factoryAddresses, null, "  ");
  fs.writeFileSync("./factoryAddresses.json", addressesJson, (err) => {
    if (err) throw err;
  });

  console.log("Gas used so far: %s", gasUsed);

  const alphaDeployment = await AlphaDeployment.deploy(...factoryAddresses, {
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${alphaDeployment.deployTransaction.hash}`
  );
  const receipt = await alphaDeployment.deployTransaction.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);
  deploy_data["AlphaDeployment"] = AlphaDeployment.address;
  console.log(`AlphaDeployment: ${chalk.green(alphaDeployment.address)}`);
  console.log("");

  updateDeployJsons(networkName, deploy_data);
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      alphaDeployment.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: alphaDeployment.address,
      constructorArguments: factoryAddresses,
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
