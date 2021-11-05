const hre = require("hardhat");
const { ethers } = hre;
const { impersonateAccount, bytes32 } = require("../../utils/helpers");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";
const EMERGENCY_SAFE = "0xEf17933d32e07a5b789405Bd197F02D6BB393147";
const ADMIN_SAFE = "0x1f7f8DA3eac80DBc0b4A49BC447A88585D8766C8";
const LP_SAFE = "0x5b79121EA6dC2395B8046eCDCE14D66c2bF221B0";

/*
 * @param {Number|string} [ethBalance=5] - ETH balance for
 * the Safe in big units.  Default is 5 ETH.
 */
async function impersonateEmergencySafe(ethBalance) {
  return await impersonateAccount(EMERGENCY_SAFE, ethBalance);
}

async function impersonateLpSafe(ethBalance) {
  return await impersonateAccount(LP_SAFE, ethBalance);
}

async function impersonateAdminSafe(ethBalance) {
  return await impersonateAccount(ADMIN_SAFE, ethBalance);
}

async function getAddressRegistry() {
  const emergencySafe = await impersonateAccount(EMERGENCY_SAFE);
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    MAINNET_ADDRESS_REGISTRY,
    emergencySafe
  );
  return addressRegistry;
}

async function getRegisteredContract(contractId, signer) {
  const idToContractName = {
    daiDemoPool: "PoolTokenV2",
    usdcDemoPool: "PoolTokenV2",
    usdtDemoPool: "PoolTokenV2",
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

async function unlockOracleAdapter() {
  const emergencySafe = await impersonateEmergencySafe();
  const oracleAdapter = await getRegisteredContract(
    "oracleAdapter",
    emergencySafe
  );
  await oracleAdapter.emergencyUnlock();
}

module.exports = {
  impersonateEmergencySafe,
  impersonateAdminSafe,
  impersonateLpSafe,
  getAddressRegistry,
  getRegisteredContract,
  unlockOracleAdapter,
};
