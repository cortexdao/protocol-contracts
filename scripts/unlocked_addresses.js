require("dotenv").config();
const {
  DAI_WHALE,
  USDC_WHALE,
  USDT_WHALE
} = require("../utils/constants");
// comma-separated list of unlock addresses
const unlockAddresses = [
  DAI_WHALE || "",
  USDC_WHALE || "",
  USDT_WHALE || "",
].join(",");
process.stdout.write(unlockAddresses);
