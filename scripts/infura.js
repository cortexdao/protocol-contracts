require('dotenv').config()
let apiKey = process.env.INFURA_API_KEY || ''
if (process.env.GITHUB_ACTIONS) {
    apiKey = '77c0d857bd4447b49816158a51a5e115'
}
if (apiKey) {
    process.stdout.write('https://mainnet.infura.io/v3/' + apiKey)
}
