require("dotenv").config();

require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-etherscan");
require("./scripts/claim_rewards");
require("./scripts/fund_rewards");

module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      timeout: 1000000,
    },
    coverage: {
      url: "http://localhost:8555",
    },
    mainnet: {
      url: "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY,
      gasPrice: 72e9,
      accounts: {
        mnemonic: process.env.MNEMONIC || "",
      },
      timeout: 1000000,
    },
    kovan: {
      url: "https://kovan.infura.io/v3/" + process.env.INFURA_API_KEY,
      accounts: {
        mnemonic: process.env.MNEMONIC || "",
      },
    },
  },
  solidity: {
    version: "0.6.11",
    optimizer: {
      enabled: true,
      runs: 999999,
    },
  },
  mocha: {
    timeout: 1000000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
