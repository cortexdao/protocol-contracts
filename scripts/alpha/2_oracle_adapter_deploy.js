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
const { ethers, network } = require("hardhat");
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  bytes32,
  getGasPrice,
  updateDeployJsons,
  getAggregatorAddress,
  getDeployedAddress,
  getStablecoinAddress,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const ORACLE_ADAPTER_MNEMONIC = process.env.ORACLE_ADAPTER_MNEMONIC;
  const oracleAdapterDeployer = ethers.Wallet.fromMnemonic(
    ORACLE_ADAPTER_MNEMONIC
  ).connect(ethers.provider);
  console.log("Deployer address:", oracleAdapterDeployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: oracleAdapterDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (
      await ethers.provider.getBalance(oracleAdapterDeployer.address)
    ).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const OracleAdapter = await ethers.getContractFactory(
    "OracleAdapter",
    oracleAdapterDeployer
  );

  let deploy_data = {};
  let gasUsed = BigNumber.from("0");
  let gasPrice = await getGasPrice(argv.gasPrice);

  const addressRegistryProxyAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );

  const tvlAggAddress = getAggregatorAddress("TVL", "MAINNET");
  const aggStalePeriod = 86400;

  const symbols = ["DAI", "USDC", "USDT"];
  const assets = symbols.map((symbol) =>
    getStablecoinAddress(symbol, networkName)
  );
  const sources = symbols.map((symbol) =>
    getAggregatorAddress(`${symbol}-USD`, networkName)
  );
  const oracleAdapter = await OracleAdapter.deploy(
    addressRegistryProxyAddress,
    tvlAggAddress,
    assets,
    sources,
    aggStalePeriod,
    {
      gasPrice,
    }
  );
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${oracleAdapter.deployTransaction.hash}`
  );
  let receipt = await oracleAdapter.deployTransaction.wait();
  deploy_data["OracleAdapter"] = oracleAdapter.address;
  console.log(`Oracle adapter: ${chalk.green(oracleAdapter.address)}`);
  console.log("  TVL Aggregator:", tvlAggAddress);
  console.log("  Aggregator stale period:", aggStalePeriod);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryProxyAddress,
    addressRegistryDeployer
  );

  gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await addressRegistry.registerAddress(
    bytes32("oracleAdapter"),
    oracleAdapter.address,
    {
      gasPrice,
    }
  );
  console.log("Register address:", `https://etherscan.io/tx/${trx.hash}`);
  console.log("");
  receipt = await trx.wait();
  gasUsed = gasUsed.add(receipt.gasUsed);

  updateDeployJsons(networkName, deploy_data);
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(
      oracleAdapter.deployTransaction.hash,
      5
    ); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: oracleAdapter.address,
      constructorArguments: [
        tvlAggAddress,
        assets,
        sources,
        aggStalePeriod.toString(),
      ],
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
