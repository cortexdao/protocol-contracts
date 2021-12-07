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

  const erc20Allocation = await ethers.getContractAt(
    "Erc20Allocation",
    erc20AllocationAddress
  );

  return erc20Allocation;
}

async function deployTransferOwnership(deployer) {
  await deployer.deploy9TransferOwnership();
}

async function deployAllocations(tvlManager, adminSafe) {
  const contracts = [
    "AaveStableCoinAllocation",
    "CurveAaveAllocation",
    "CurveCompoundAllocation",
    "CurveIronbankAllocation",
    "CurveSaaveAllocation",
    "CurveSusdv2Allocation",
    "CurveUsdtAllocation",
  ];

  const curve3PoolAllocationContract = "Curve3poolAllocation";

  const curveMetaPoolContracts = [
    "CurveAlusdAllocation",
    "CurveBusdv2Allocation",
    "CurveFraxAllocation",
    "CurveLusdAllocation",
    "CurveMusdAllocation",
    "CurveOusdAllocation",
    "CurveUsdnAllocation",
    "CurveUsdpAllocation",
    "CurveUstAllocation",
    "CurveMimAllocation",
  ];

  const regularAllocations = await Promise.all(
    contracts.map(async (contract) => {
      const Allocation = await ethers.getContractFactory(contract);
      return await Allocation.deploy();
    })
  );

  const Curve3PoolAllocation = await ethers.getContractFactory(
    curve3PoolAllocationContract
  );
  const curve3PoolAllocation = await Curve3PoolAllocation.deploy();

  const metaPoolAllocations = await Promise.all(
    curveMetaPoolContracts.map(async (contract) => {
      const Allocation = await ethers.getContractFactory(contract);
      return await Allocation.deploy(curve3PoolAllocation.address);
    })
  );

  const allAllocations = [
    ...regularAllocations,
    curve3PoolAllocation,
    ...metaPoolAllocations,
  ];

  allAllocations.forEach(async (allocation) => {
    await tvlManager
      .connect(adminSafe)
      .registerAssetAllocation(allocation.address);
  });

  return allAllocations;
}

async function deployZaps(lpAccount, erc20Allocation, adminSafe) {
  const contracts = [
    //"AaveDaiZap",
    //"AaveUsdcZap",
    //"AaveUsdtZap",
    "StakedAaveZap",
    "Curve3poolZap",
    "CurveAaveZap",
    "CurveAlusdZap",
    "CurveBusdv2Zap",
    "CurveCompoundZap",
    "CurveFraxZap",
    "CurveIronbankZap",
    "CurveLusdZap",
    "CurveMusdZap",
    "CurveOusdZap",
    "CurveSaaveZap",
    "CurveSusdv2Zap",
    "CurveUsdnZap",
    "CurveUsdpZap",
    "CurveUsdtZap",
    "CurveUstZap",
    "CurveMimZap",
  ];

  const zaps = await Promise.all(
    contracts.map(async (contract) => {
      const Zap = await ethers.getContractFactory(contract);
      return await Zap.deploy();
    })
  );

  await Promise.all(
    zaps.map(async (zap) => {
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const erc20s = await zap.erc20Allocations();
      await registerErc20Allocations(erc20Allocation, erc20s, adminSafe);
    })
  );

  return zaps;
}

async function deploySwaps(lpAccount, erc20Allocation, adminSafe) {
  const contracts = [
    "AaveToDaiSwap",
    "AaveToUsdcSwap",
    "AaveToUsdtSwap",
    "CrvToDaiSwap",
    "CrvToUsdcSwap",
    "CrvToUsdtSwap",
  ];

  const swaps = await Promise.all(
    contracts.map(async (contract) => {
      const Swap = await ethers.getContractFactory(contract);
      return await Swap.deploy();
    })
  );

  await Promise.all(
    swaps.map(async (swap) => {
      await lpAccount.connect(adminSafe).registerSwap(swap.address);
      const erc20s = await swap.erc20Allocations();
      await registerErc20Allocations(erc20Allocation, erc20s, adminSafe);
    })
  );

  return swaps;
}

async function registerErc20Allocations(erc20Allocation, erc20s, adminSafe) {
  await Promise.all(
    erc20s.map(async (erc20) => {
      await erc20Allocation
        .connect(adminSafe)
        ["registerErc20Token(address)"](erc20);
    })
  );
}

async function deploy() {
  const { deployer, safes } = await setup();

  const addressRegistry = await deployAddressRegistry(deployer);

  await registerSafes(deployer);

  const metaPoolToken = await deployMetaPoolToken(deployer);

  const underlyerPools = await deployPools(deployer);

  const tvlManager = await deployTvlManager(deployer);

  const lpAccount = await deployLpAccount(deployer);

  const oracleAdapter = await deployOracleAdapter(deployer);

  const erc20Allocation = await registerErc20Allocation(
    deployer,
    tvlManager,
    safes.adminSafe
  );

  const erc20s = await Promise.all(
    Object.values(underlyerPools).map(async (pool) => {
      return await pool.underlyer();
    })
  );

  await registerErc20Allocations(erc20Allocation, erc20s, safes.adminSafe);

  await deployTransferOwnership(deployer);

  await deployAllocations(tvlManager, safes.adminSafe);

  await deployZaps(lpAccount, erc20Allocation, safes.adminSafe);

  await deploySwaps(lpAccount, erc20Allocation, safes.adminSafe);

  return {
    ...safes,
    addressRegistry,
    metaPoolToken,
    underlyerPools,
    tvlManager,
    lpAccount,
    oracleAdapter,
  };
}

module.exports = {
  deploy,
};
