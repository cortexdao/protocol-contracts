require('dotenv').config()
const apiKey = process.env.INFURA_API_KEY || ''
if (apiKey) {
    process.stdout.write('https://mainnet.infura.io/v3/' + apiKey)
}
