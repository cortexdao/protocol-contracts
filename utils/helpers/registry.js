const hre = require("hardhat");
const { ethers } = hre;
const { ADDRESS_REGISTRY } = require("../constants");
const { bytes32 } = require("./unit");

async function getAddressRegistry() {
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    ADDRESS_REGISTRY
  );
  return addressRegistry;
}

async function getRegisteredContract(contractId, signer) {
  const idToContractName = {
    daiDemoPool: "PoolTokenV2",
    usdcDemoPool: "PoolTokenV2",
    usdtDemoPool: "PoolTokenV2",
    daiPool: "PoolTokenV2",
    usdcPool: "PoolTokenV2",
    usdtPool: "PoolTokenV2",
    lpAccount: "LpAccount",
    mApt: "MetaPoolToken",
    oracleAdapter: "OracleAdapter",
    tvlManager: "TvlManager",
  };
  const addressRegistry = await getAddressRegistry();
  const contractAddress = await addressRegistry.getAddress(bytes32(contractId));
  const contractName = idToContractName[contractId];
  const contract = await ethers.getContractAt(
    contractName,
    contractAddress,
    signer
  );
  return contract;
}

module.exports = {
  getAddressRegistry,
  getRegisteredContract,
};
