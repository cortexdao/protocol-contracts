const _ = require("lodash");
const { ethers } = require("hardhat");

async function deployFactories() {
  const factoryConfig = {
    ProxyAdminFactory: "proxyAdminFactory",
    ProxyFactory: "proxyFactory",
    AddressRegistryV2Factory: "addressRegistryV2Factory",
    MetaPoolTokenFactory: "mAptFactory",
    PoolTokenV1Factory: "poolTokenV1Factory",
    PoolTokenV2Factory: "poolTokenV2Factory",
    TvlManagerFactory: "tvlManagerFactory",
    Erc20AllocationFactory: "erc20AllocationFactory",
    OracleAdapterFactory: "oracleAdapterFactory",
    LpAccountFactory: "lpAccountFactory",
  };

  const factories = await Promise.all(
    Object.keys(factoryConfig).map(async (name) => {
      const Factory = await ethers.getContractFactory(name);
      const factory = await Factory.deploy();
      return factory.address;
    })
  );

  const factoryStruct = _.zipObject(Object.values(factoryConfig), factories);

  return factoryStruct;
}

module.exports = {
  deployFactories,
};
