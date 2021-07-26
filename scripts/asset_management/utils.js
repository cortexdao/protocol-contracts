const hre = require("hardhat");
const { ethers } = hre;
const chalk = require("chalk");
const {
  getDeployedAddress,
  getStablecoinAddress,
  bytes32,
  console,
} = require("../../utils/helpers");

console.logAddress = function (contractName, contractAddress) {
  contractName = contractName + ":";
  contractAddress = chalk.green(contractAddress);
  console.log.apply(this, [contractName, contractAddress]);
};

console.logDone = function () {
  console.log("");
  console.log.apply(this, [chalk.green("√") + " ... done."]);
  console.log("");
};

async function getAddressRegistry(networkName) {
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );
  return addressRegistry;
}

async function getPoolManager(networkName) {
  const addressRegistry = await getAddressRegistry(networkName);
  const poolManagerAddress = await addressRegistry.poolManagerAddress();
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress
  );
  return poolManager;
}

async function getOracleAdapter(networkName) {
  const addressRegistry = await getAddressRegistry(networkName);
  const oracleAdapterAddress = await addressRegistry.oracleAdapterAddress();
  const oracleAdapter = await ethers.getContractAt(
    "OracleAdapter",
    oracleAdapterAddress
  );
  return oracleAdapter;
}

async function getTvlManager(networkName) {
  const addressRegistry = await getAddressRegistry(networkName);
  const tvlManagerAddress = await addressRegistry.tvlManagerAddress();
  const tvlManager = await ethers.getContractAt(
    "TvlManager",
    tvlManagerAddress
  );
  return tvlManager;
}

async function getStablecoins(networkName) {
  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const tokenAddress = getStablecoinAddress(symbol, networkName);
    const token = await ethers.getContractAt(
      "IDetailedERC20UpgradeSafe",
      tokenAddress
    );
    stablecoins[symbol] = token;
  }
  return stablecoins;
}

async function getApyPool(networkName, symbol) {
  const addressRegistry = await getAddressRegistry(networkName);
  const poolId = bytes32(symbol.toLowerCase() + "Pool");
  const poolAddress = await addressRegistry.getAddress(poolId);
  const pool = await ethers.getContractAt("PoolTokenV2", poolAddress);
  return pool;
}

module.exports = {
  console,
  getApyPool,
  getStablecoins,
  getAddressRegistry,
  getOracleAdapter,
  getPoolManager,
  getTvlManager,
};
