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
};
