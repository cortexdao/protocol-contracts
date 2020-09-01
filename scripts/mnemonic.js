require('dotenv').config()
const mnemonic = process.env.MNEMONIC || ''
process.stdout.write(mnemonic)
