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
const { argv } = require("yargs")
  .option("maxFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .option("maxPriorityFeePerGas", {
    type: "number",
    description: "Gas price in gwei; omitting uses default Ethers logic",
  })
  .option("compile", {
    type: "boolean",
    default: true,
    description: "Compile contract using `compile:one`",
  });
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  getMaxFee,
  getSafeSigner,
  waitForSafeTxDetails,
} = require("../../utils/helpers");
const fs = require("fs");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const owner = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", owner.address);
  console.log("");

  // const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const adminSafeAddress = "0xacC66a1bD538cfCBB801FC047f41A3FC0AECf87a"; // Rinkeby Safe
  const safeSigner = await getSafeSigner(adminSafeAddress, owner, networkName);

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const factoryNames = [
    "ProxyFactory",
    "AddressRegistryV2Factory",
    "MetaPoolTokenFactory",
    "PoolTokenV1Factory",
    "PoolTokenV2Factory",
    "TvlManagerFactory",
    "Erc20AllocationFactory",
    "OracleAdapterFactory",
    "LpAccountFactory",
  ];

  const deployed = {
    ProxyFactory: "0x2FA1A3E783A97218DAb9a1ab4C4eeBb727C928b5",
    PoolTokenV1Factory: "0x803434B221EDa8Dea447b83465869a7Df8fA1b6A",
  };
  const factoryAddresses = [];
  const addressesFilename = "scripts/alpha/deployment-factory-addresses.json";
  let gasUsed = BigNumber.from("0");

  // await hre.run("clean");
  // await hre.run("compile");

  for (const name of factoryNames) {
    console.log(chalk.green(name));
    let deployedAddress;
    if (deployed[name]) {
      deployedAddress = deployed[name];
    } else {
      const contractFactory = await ethers.getContractFactory(name, deployer);

      await hre.run("compile:one", { contractName: name });

      const maxFeePerGas = await getMaxFee(argv.gasPrice);
      const maxPriorityFeePerGas = parseInt(2e9);
      const contract = await contractFactory.connect(safeSigner).deploy({
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      console.log(`https://etherscan.io/tx/${contract.deployTransaction.hash}`);
      // const receipt = await contract.deployTransaction.wait();
      await waitForSafeTxDetails(
        contract.deployTransaction,
        safeSigner.service,
        5
      );
      console.log("  ... done.");
      console.log("");

      deployedAddress = contract.address;
    }

    factoryAddresses.push(deployedAddress);

    // rewrite file on each iteration to safeguard against failed deployment
    const addressesJson = JSON.stringify(factoryAddresses, null, "  ");
    fs.writeFileSync(addressesFilename, addressesJson, (err) => {
      if (err) throw err;
    });
  }

  console.log("Total gas used: %s", chalk.yellow(gasUsed));
  console.log("");
  console.log("Deployed addresses filename: %s", addressesFilename);
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
