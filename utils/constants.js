const WHALE_POOLS = {
  // sUSD curve pool has plenty of these stablecoins
  // https://etherscan.io/address/0xa5407eae9ba41422680e2e00537571bcc53efbfd
  DAI: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  ADAI: "0xeb16ae0052ed37f479f7fe63849198df1765a733",
  USDC: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  USDT: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
  ALUSD: "0x43b4fdfd4ff969587185cdb6f0bd875c5fc83f8c",
  BUSD: "0x4807862aa8b2bf68830e4c8dc86d0e9a998e085a",
  CDAI: "0x6341c289b2e0795a04223df04b53a77970958723",
  FRAX: "0xc69ddcd4dfef25d8a793241834d4cc4b3668ead6",
  CYDAI: "0x2dded6da1bf5dbdf597c45fcfaa3194e53ecfeaf",
  LUSD: "0x66017d22b0f8556afdd19fc67041899eb65a21bb",
  MUSD: "0x30647a72dc82d7fbb1123ea74716ab8a317eac19",
  OUSD: "0x87650D7bbfC3A9F10587d7778206671719d9910D",
  USDN: "0x0f9cb53ebe405d49a0bbdbd291a65ff571bc83e1",
  USDP: "0x42d7025938bec20b69cbae5a77421082407f053a",
  UST: "0xf92cd566ea4864356c5491c177a430c222d7e678",
  AAVE: "0xC697051d1C6296C24aE3bceF39acA743861D9A81",
  MIM: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
  "UST-Wormhole": "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269",
  DOLA: "0xAA5A67c256e27A5d80712c51971408db3370927D",
};

const FARM_TOKENS = {
  CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
  CVX: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B",
  AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
  stkAAVE: "0x4da27a545c0c5B758a6BA100e3a049001de870f5",
  SNX: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
  OGN: "0x8207c1FfC5B6804F6024322CcF34F29c3541Ae26",
};

const FARM_TOKEN_POOLS = {
  CRV: "0xd2D43555134dC575BF7279F4bA18809645dB0F1D",
  CVX: "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332",
  AAVE: "0xC697051d1C6296C24aE3bceF39acA743861D9A81",
  SNX: "0x020C349A0541D76C16F501Abc6B2E9c98AdAe892",
  OGN: "0x70BB8E6844DFB681810FD557DD741bCaF027bF94",
};

const CHAIN_IDS = {
  MAINNET: "1",
  RINKEBY: "4",
  GOERLI: "5",
  KOVAN: "42",
  LOCALHOST: "1",
  TESTNET: "1",
};

// for Chainlink aggregator (price feed) addresses, see the Mainnet
// section of: https://docs.chain.link/docs/ethereum-addresses
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
  TESTNET: {
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
  TESTNET: [
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

const ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";
const EMERGENCY_SAFE = "0xEf17933d32e07a5b789405Bd197F02D6BB393147";
const ADMIN_SAFE = "0x1f7f8DA3eac80DBc0b4A49BC447A88585D8766C8";
const LP_SAFE = "0x5b79121EA6dC2395B8046eCDCE14D66c2bF221B0";

module.exports = {
  WHALE_POOLS,
  FARM_TOKENS,
  FARM_TOKEN_POOLS,
  CHAIN_IDS,
  AGG_MAP,
  TOKEN_AGG_MAP,
  ADDRESS_REGISTRY,
  EMERGENCY_SAFE,
  ADMIN_SAFE,
  LP_SAFE,
};
