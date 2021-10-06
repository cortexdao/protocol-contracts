const _ = require("lodash");
const { ethers } = require("hardhat");
const { deployFactories } = require("./factories");

async function deployNewDeployment(factories, safes) {
  const NewDeployment = await ethers.getContractFactory("NewDeployment");
  const newDeployment = await NewDeployment.deploy(factories, safes);

  return newDeployment;
}

async function setup() {
  const lpSafe = await ethers.getSigner(7);
  const adminSafe = await ethers.getSigner(8);
  const emergencySafe = await ethers.getSigner(9);
  const safes = { lpSafe, adminSafe, emergencySafe };
  const safeAddresses = _.zipObject(
    Object.keys(safes),
    Object.values(safes).map((a) => a.address)
  );

  const factories = await deployFactories();

  const deployer = await deployNewDeployment(factories, safeAddresses);

  return { deployer, safes: { lpSafe, adminSafe, emergencySafe } };
}

async function deployAddressRegistry(deployer) {
  await deployer.deploy0AddressRegistryV2();

  const addressRegistryAddress = await deployer.addressRegistryV2();
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );

  return addressRegistry;
}

async function registerSafes(deployer) {
  await deployer.deploy1RegisterSafes();
}

async function deployMetaPoolToken(deployer) {
  await deployer.deploy2MetaPoolToken();

  const metaPoolTokenAddress = await deployer.mApt();
  const metaPoolToken = await ethers.getContractAt(
    "MetaPoolToken",
    metaPoolTokenAddress
  );

  return metaPoolToken;
}

async function deployPools(deployer) {
  await deployer.deploy3DaiPoolTokenV2();

  const daiPoolAddress = await deployer.daiPool();
  const daiPool = await ethers.getContractAt("PoolTokenV2", daiPoolAddress);

  await deployer.deploy4UsdcPoolTokenV2();

  const usdcPoolAddress = await deployer.usdcPool();
  const usdcPool = await ethers.getContractAt("PoolTokenV2", usdcPoolAddress);

  await deployer.deploy5UsdtPoolTokenV2();

  const usdtPoolAddress = await deployer.usdtPool();
  const usdtPool = await ethers.getContractAt("PoolTokenV2", usdtPoolAddress);

  return { daiPool, usdcPool, usdtPool };
}

async function deployTvlManager(deployer) {
  await deployer.deploy6TvlManager();

  const tvlManagerAddress = await deployer.tvlManager();
  const tvlManager = await ethers.getContractAt(
    "TvlManager",
    tvlManagerAddress
  );

  return tvlManager;
}

async function deployLpAccount(deployer) {
  await deployer.deploy7LpAccount();

  const lpAccountAddress = await deployer.lpAccount();
  const lpAccount = await ethers.getContractAt("LpAccount", lpAccountAddress);

  return lpAccount;
}

async function deployOracleAdapter(deployer) {
  await deployer.deploy8OracleAdapter();

  const oracleAdapterAddress = await deployer.oracleAdapter();
  const oracleAdapter = await ethers.getContractAt(
    "OracleAdapter",
    oracleAdapterAddress
  );

  return oracleAdapter;
}

async function registerErc20Allocation(deployer, tvlManager, adminSafe) {
  const erc20AllocationAddress = await deployer.erc20Allocation();
  await tvlManager
    .connect(adminSafe)
    .registerAssetAllocation(erc20AllocationAddress);
}

async function deployTransferOwnership(deployer) {
  await deployer.deploy9TransferOwnership();
}

async function deploy() {
  const { deployer, safes } = await setup();

  const addressRegistry = await deployAddressRegistry(deployer);

  await registerSafes(deployer);

  const metaPoolToken = await deployMetaPoolToken(deployer);

  const pools = await deployPools(deployer);

  const tvlManager = await deployTvlManager(deployer);

  const lpAccount = await deployLpAccount(deployer);

  const oracleAdapter = await deployOracleAdapter(deployer);

  await registerErc20Allocation(deployer, tvlManager, safes.adminSafe);

  await deployTransferOwnership(deployer);

  return {
    ...safes,
    addressRegistry,
    metaPoolToken,
    ...pools,
    tvlManager,
    lpAccount,
    oracleAdapter,
  };
}

module.exports = {
  deploy,
};
