require("dotenv").config();
const {
  DAI_MINTER_ADDRESS,
  TETHER_TREASURY_ADDRESS,
  USDC_WHALE_ADDRESS,
} = require("../utils/constants");
// comma-separated list of unlock addresses
const unlockAddresses = [
  DAI_MINTER_ADDRESS || "",
  TETHER_TREASURY_ADDRESS || "",
  USDC_WHALE_ADDRESS || "",
].join(",");
process.stdout.write(unlockAddresses);
