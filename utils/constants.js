/* --------------------------------------------- */
/* ---------  Mainnet addresses ---------------- */
/* --------------------------------------------- */

/* Maker DAO */
// https://changelog.makerdao.com/releases/mainnet/latest/contracts.json
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // MCD_DAI
const DAI_MINTER_ADDRESS = "0x9759A6Ac90977b93B58547b4A71c78317f391A28"; // MCD_JOIN_DAI
const CDAI_ADDRESS = "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643";

/* Compound Finance */
const COMPTROLLER_ADDRESS = "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b";
const COMP_ADDRESS = "0xc00e94Cb662C3520282E6f5717214004A7f26888";

/* 1inch Exchange
These contracts move around with some frequency.  If you run into a
"no code at <address>" error, you should double-check these etherscan
urls for the versions of OneSplitAudit:

latest version: https://etherscan.io/address/1split.eth
beta version: https://etherscan.io/address/1proto.eth
*/
const ONE_SPLIT_ADDRESS = "0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e"; // 1proto.eth

/* Tether */
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const TETHER_ADDRESS = USDT_ADDRESS;
const TETHER_TREASURY_ADDRESS = "0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828";

/* Misc */
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_WHALE_ADDRESS = "0x329239599afb305da0a2ec69c58f8a6697f9f88d";
const BAL_ADDRESS = "0xba100000625a3754423978a60c9317c58a424e3D";
const DUMMY_ADDRESS = "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE";
const UNLOCKED_ADDRESS = DAI_MINTER_ADDRESS;

const CHAIN_IDS = {
  MAINNET: '1',
  RINKEBY: '4',
  GOERLI: '5',
  KOVAN: '42',
}

const CHAIN_NAMES = {
  '1': 'MAINNET',
  '4': 'RINKEBY',
  '5': 'GOERLI',
  '42': 'KOVAN',
}

const TOKEN_AGG_MAP = {
  "MAINNET": [
    {
      "symbol": "DAI",
      "token": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "aggregator": "0x773616E4d11A78F511299002da57A0a94577F1f4"
    },
    {
      "symbol": "USDC",
      "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "aggregator": "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"
    },
    {
      "symbol": "USDT",
      "token": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "aggregator": "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46"
    }
  ],
  "KOVAN": [
    {
      "symbol": "DAI",
      "token": "0xff795577d9ac8bd7d90ee22b6c1703490b6512fd",
      "aggregator": "0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541"
    },
    {
      "symbol": "USDC",
      "token": "0xe22da380ee6b445bb8273c81944adeb6e8450422",
      "aggregator": "0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838"
    },
    {
      "symbol": "USDT",
      "token": "0x13512979ade267ab5100878e2e0f485b568328a4",
      "aggregator": "0x0bF499444525a23E7Bb61997539725cA2e928138"
    }
  ]
}
const DEPLOYS_JSON = {
  ProxyAdmin: '../deployed_addresses/ProxyAdminAddresses.json',
  APYPoolToken: '../deployed_addresses/APYPoolTokenAddresses.json',
  APYPoolTokenProxy: '../deployed_addresses/APYPoolTokenProxyAddresses.json'
}

module.exports = {
  CDAI_ADDRESS,
  DAI_ADDRESS,
  DAI_MINTER_ADDRESS,
  COMPTROLLER_ADDRESS,
  COMP_ADDRESS,
  ONE_SPLIT_ADDRESS,
  USDT_ADDRESS,
  TETHER_ADDRESS,
  TETHER_TREASURY_ADDRESS,
  USDC_ADDRESS,
  USDC_WHALE_ADDRESS,
  BAL_ADDRESS,
  DUMMY_ADDRESS,
  UNLOCKED_ADDRESS,
  CHAIN_IDS,
  CHAIN_NAMES,
  TOKEN_AGG_MAP,
  DEPLOYS_JSON
};
