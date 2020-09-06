require("dotenv").config();
const { DAI_MINTER_ADDRESS } = require("../integration/constants");
// comma-separated list of unlock addresses
const unlockAddresses = DAI_MINTER_ADDRESS || "";
process.stdout.write(unlockAddresses);
