const DAI_WHALE = '0x897607ab556177b0e0938541073ac1e01c55e483'
const USDC_WHALE = '0x8cee3eeab46774c1CDe4F6368E3ae68BcCd760Bf'
const USDT_WHALE = '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8'

const CHAIN_IDS = {
  MAINNET: "1",
  RINKEBY: "4",
  GOERLI: "5",
  KOVAN: "42",
};

const CHAIN_NAMES = {
  "1": "MAINNET",
  "4": "RINKEBY",
  "5": "GOERLI",
  "42": "KOVAN",
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
};
const DEPLOYS_JSON = {
  ProxyAdmin: "../deployed_addresses/ProxyAdminAddresses.json",
  DAI_APYPoolToken: "../deployed_addresses/DAI_APYPoolTokenAddresses.json",
  DAI_APYPoolTokenProxy:
    "../deployed_addresses/DAI_APYPoolTokenProxyAddresses.json",
  USDC_APYPoolToken: "../deployed_addresses/USDC_APYPoolTokenAddresses.json",
  USDC_APYPoolTokenProxy:
    "../deployed_addresses/USDC_APYPoolTokenProxyAddresses.json",
  USDT_APYPoolToken: "../deployed_addresses/USDT_APYPoolTokenAddresses.json",
  USDT_APYPoolTokenProxy:
    "../deployed_addresses/USDT_APYPoolTokenProxyAddresses.json",
};

module.exports = {
  DAI_WHALE,
  USDC_WHALE,
  USDT_WHALE,
  CHAIN_IDS,
  CHAIN_NAMES,
  TOKEN_AGG_MAP,
  DEPLOYS_JSON,
};
