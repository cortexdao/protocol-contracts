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
    "ETH-USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    TVL: "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE",
  },
  KOVAN: {
    "ETH-USD": "0x9326BFA02ADD2366b30bacB125260Af641031331",
    TVL: "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE",
  },
  LOCALHOST: {
    "ETH-USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    TVL: "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE",
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
  APYGovernanceTokenProxyAdmin: `${__dirname}/../deployed_addresses/APYGovernanceTokenProxyAdmin.json`,
  APYGovernanceToken: `${__dirname}/../deployed_addresses/APYGovernanceToken.json`,
  APYGovernanceTokenProxy: `${__dirname}/../deployed_addresses/APYGovernanceTokenProxy.json`,
  APYMetaPoolTokenProxyAdmin: `${__dirname}/../deployed_addresses/APYMetaPoolTokenProxyAdmin.json`,
  APYMetaPoolToken: `${__dirname}/../deployed_addresses/APYMetaPoolToken.json`,
  APYMetaPoolTokenProxy: `${__dirname}/../deployed_addresses/APYMetaPoolTokenProxy.json`,
  APYPoolTokenProxyAdmin: `${__dirname}/../deployed_addresses/APYPoolTokenProxyAdmin.json`,
  DAI_APYPoolToken: `${__dirname}/../deployed_addresses/DAI_APYPoolToken.json`,
  DAI_APYPoolTokenProxy: `${__dirname}/../deployed_addresses/DAI_APYPoolTokenProxy.json`,
  USDC_APYPoolToken: `${__dirname}/../deployed_addresses/USDC_APYPoolToken.json`,
  USDC_APYPoolTokenProxy: `${__dirname}/../deployed_addresses/USDC_APYPoolTokenProxy.json`,
  USDT_APYPoolToken: `${__dirname}/../deployed_addresses/USDT_APYPoolToken.json`,
  USDT_APYPoolTokenProxy: `${__dirname}/../deployed_addresses/USDT_APYPoolTokenProxy.json`,
  APYRewardDistributor: `${__dirname}/../deployed_addresses/APYRewardDistributor.json`,
  APYAddressRegistryProxyAdmin: `${__dirname}/../deployed_addresses/APYAddressRegistryProxyAdmin.json`,
  APYAddressRegistry: `${__dirname}/../deployed_addresses/APYAddressRegistry.json`,
  APYAddressRegistryProxy: `${__dirname}/../deployed_addresses/APYAddressRegistryProxy.json`,
  APYManagerProxyAdmin: `${__dirname}/../deployed_addresses/APYManagerProxyAdmin.json`,
  APYManager: `${__dirname}/../deployed_addresses/APYManager.json`,
  APYManagerProxy: `${__dirname}/../deployed_addresses/APYManagerProxy.json`,
  ProxyConstructorArg: `${__dirname}/../deployed_addresses/ProxyConstructorArg.json`,
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
