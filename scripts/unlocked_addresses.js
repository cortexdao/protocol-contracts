require("dotenv").config();
const {
  DAI_MINTER_ADDRESS,
  TETHER_TREASURY_ADDRESS,
  USDC_WHALE_ADDRESS,
} = require("../utils/constants");
// comma-separated list of unlock addresses
const unlockAddresses = [
  process.env.DAI_WHALE || "",
  process.env.USDC_WHALE || "",
  process.env.USDT_WHALE || "",
].join(",");
process.stdout.write(unlockAddresses);
