const DAI_WHALE = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";
const USDC_WHALE = "0x8cee3eeab46774c1CDe4F6368E3ae68BcCd760Bf";
const USDT_WHALE = "0x1bEEf1db7FB7cF3A932Dc96CACaf9d837ddEc45F";

const WHALE_ADDRESSES = {
  DAI: DAI_WHALE,
  USDC: USDC_WHALE,
  USDT: USDT_WHALE,
};

const STABLECOIN_POOLS = {
  // sUSD curve pool has plenty of these stablecoins
  // https://etherscan.io/address/0xa5407eae9ba41422680e2e00537571bcc53efbfd
  DAI: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  USDC: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  USDT: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
};

const CHAIN_IDS = {
  MAINNET: "1",
  RINKEBY: "4",
  GOERLI: "5",
  KOVAN: "42",
  LOCALHOST: "1", //should be 99, but signature claiming fails in emergency withdraw otherwise
};

const CHAIN_NAMES = {
  1: "MAINNET",
  4: "RINKEBY",
  5: "GOERLI",
  42: "KOVAN",
  99: "LOCALHOST",
};

const AGG_MAP = {
  MAINNET: {
    TVL: "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE",
    "ETH-USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "DAI-ETH": "0x773616E4d11A78F511299002da57A0a94577F1f4",
    "USDC-ETH": "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    "USDT-ETH": "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
  },
  KOVAN: {
    TVL: "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE",
    "ETH-USD": "0x9326BFA02ADD2366b30bacB125260Af641031331",
    "DAI-ETH": "0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541",
    "USDC-ETH": "0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838",
    "USDT-ETH": "0x0bF499444525a23E7Bb61997539725cA2e928138",
  },
  LOCALHOST: {
    // TVL agg address is based on local deployment logic using
    // our own ganache test mnemonic, i.e. `MNEMONIC='' yarn fork:mainnet`
    // For this to be fully deterministic, the `deploy_agg.js`
    // script must be run before any other contract deployments.
    TVL: "0x344D5d70fc3c3097f82d1F26464aaDcEb30C6AC7",
    "ETH-USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "DAI-ETH": "0x773616E4d11A78F511299002da57A0a94577F1f4",
    "USDC-ETH": "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    "USDT-ETH": "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
  },
};

const TOKEN_AGG_MAP = {
  MAINNET: [
    {
      symbol: "DAI",
      token: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      aggregator: "0x773616E4d11A78F511299002da57A0a94577F1f4",
    },
    {
      symbol: "USDC",
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      aggregator: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    },
    {
      symbol: "USDT",
      token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      aggregator: "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
    },
  ],
  KOVAN: [
    {
      symbol: "DAI",
      token: "0xff795577d9ac8bd7d90ee22b6c1703490b6512fd",
      aggregator: "0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541",
    },
    {
      symbol: "USDC",
      token: "0xe22da380ee6b445bb8273c81944adeb6e8450422",
      aggregator: "0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838",
    },
    {
      symbol: "USDT",
      token: "0x13512979ade267ab5100878e2e0f485b568328a4",
      aggregator: "0x0bF499444525a23E7Bb61997539725cA2e928138",
    },
  ],
  LOCALHOST: [
    {
      symbol: "DAI",
      token: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      aggregator: "0x773616E4d11A78F511299002da57A0a94577F1f4",
    },
    {
      symbol: "USDC",
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      aggregator: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    },
    {
      symbol: "USDT",
      token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      aggregator: "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
    },
  ],
};

const DEPLOYS_JSON = {
  GovernanceTokenProxyAdmin: `${__dirname}/../deployed_addresses/GovernanceTokenProxyAdmin.json`,
  GovernanceToken: `${__dirname}/../deployed_addresses/GovernanceToken.json`,
  GovernanceTokenProxy: `${__dirname}/../deployed_addresses/GovernanceTokenProxy.json`,
  MetaPoolTokenProxyAdmin: `${__dirname}/../deployed_addresses/MetaPoolTokenProxyAdmin.json`,
  MetaPoolToken: `${__dirname}/../deployed_addresses/MetaPoolToken.json`,
  MetaPoolTokenProxy: `${__dirname}/../deployed_addresses/MetaPoolTokenProxy.json`,
  PoolTokenProxyAdmin: `${__dirname}/../deployed_addresses/PoolTokenProxyAdmin.json`,
  DAI_PoolToken: `${__dirname}/../deployed_addresses/DAI_PoolToken.json`,
  DAI_PoolTokenProxy: `${__dirname}/../deployed_addresses/DAI_PoolTokenProxy.json`,
  USDC_PoolToken: `${__dirname}/../deployed_addresses/USDC_PoolToken.json`,
  USDC_PoolTokenProxy: `${__dirname}/../deployed_addresses/USDC_PoolTokenProxy.json`,
  USDT_PoolToken: `${__dirname}/../deployed_addresses/USDT_PoolToken.json`,
  USDT_PoolTokenProxy: `${__dirname}/../deployed_addresses/USDT_PoolTokenProxy.json`,
  RewardDistributor: `${__dirname}/../deployed_addresses/RewardDistributor.json`,
  AddressRegistryProxyAdmin: `${__dirname}/../deployed_addresses/AddressRegistryProxyAdmin.json`,
  AddressRegistry: `${__dirname}/../deployed_addresses/AddressRegistry.json`,
  AddressRegistryProxy: `${__dirname}/../deployed_addresses/AddressRegistryProxy.json`,
  ManagerProxyAdmin: `${__dirname}/../deployed_addresses/ManagerProxyAdmin.json`,
  Manager: `${__dirname}/../deployed_addresses/Manager.json`,
  ManagerProxy: `${__dirname}/../deployed_addresses/ManagerProxy.json`,
  ProxyConstructorArg: `${__dirname}/../deployed_addresses/ProxyConstructorArg.json`,
  GenericExecutor: `${__dirname}/../deployed_addresses/GenericExecutor.json`,
  Account: `${__dirname}/../deployed_addresses/Account.json`,
  AssetAllocationRegistry: `${__dirname}/../deployed_addresses/AssetAllocationRegistry.json`,
};

module.exports = {
  DAI_WHALE,
  USDC_WHALE,
  USDT_WHALE,
  WHALE_ADDRESSES,
  STABLECOIN_POOLS,
  CHAIN_IDS,
  CHAIN_NAMES,
  AGG_MAP,
  TOKEN_AGG_MAP,
  DEPLOYS_JSON,
};
