require("dotenv").config();
const { DAI_MINTER_ADDRESS } = require("../utils/constants");
// comma-separated list of unlock addresses
const unlockAddresses = DAI_MINTER_ADDRESS || "";
process.stdout.write(unlockAddresses);
