require('dotenv').config()
// comma-separated list of unlock addresses
const unlockAddresses = process.env.DAI_MINTER || ''
process.stdout.write(unlockAddresses)
