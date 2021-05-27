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
  LOCALHOST: "1",
};

const AGG_MAP = {
  MAINNET: {
    TVL: "0xDb299D394817D8e7bBe297E84AFfF7106CF92F5f",
    "DAI-USD": "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
    "USDC-USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    "USDT-USD": "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    "ETH-USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "DAI-ETH": "0x773616E4d11A78F511299002da57A0a94577F1f4",
    "USDC-ETH": "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    "USDT-ETH": "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
  },
  KOVAN: {
    TVL: "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE",
    "DAI-USD": "0x777A68032a88E5A84678A77Af2CD65A7b3c0775a",
    "USDC-USD": "0x9211c6b3BF41A10F78539810Cf5c64e1BB78Ec60",
    "USDT-USD": "0x2ca5A90D34cA333661083F89D831f757A9A50148",
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
    "DAI-USD": "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
    "USDC-USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    "USDT-USD": "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
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

function _getDeploysJson(contractName) {
  return `${__dirname}/../deployed_addresses/${contractName}.json`;
}

const CONTRACT_NAMES = [
  "PoolTokenProxyAdmin",
  "DAI_PoolToken",
  "DAI_PoolTokenProxy",
  "USDC_PoolToken",
  "USDC_PoolTokenProxy",
  "USDT_PoolToken",
  "USDT_PoolTokenProxy",
  "Account",
  "AccountManager",
  "AccountManagerProxy",
  "AccountManagerProxyAdmin",
  "AddressRegistry",
  "AddressRegistryProxy",
  "AddressRegistryProxyAdmin",
  "GenericExecutor",
  "GovernanceToken",
  "GovernanceTokenProxy",
  "GovernanceTokenProxyAdmin",
  "MetaPoolToken",
  "MetaPoolTokenProxy",
  "MetaPoolTokenProxyAdmin",
  "PoolManager",
  "PoolManagerProxy",
  "PoolManagerProxyAdmin",
  "ProxyConstructorArg",
  "RewardDistributor",
  "TVLManager",
  "LpSafe",
];

const DEPLOYS_JSON = {};
for (const contractName of CONTRACT_NAMES) {
  DEPLOYS_JSON[contractName] = _getDeploysJson(contractName);
}

module.exports = {
  STABLECOIN_POOLS,
  CHAIN_IDS,
  AGG_MAP,
  TOKEN_AGG_MAP,
  DEPLOYS_JSON,
  CONTRACT_NAMES,
};
