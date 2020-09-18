require("dotenv").config();

usePlugin("solidity-coverage");
usePlugin("@nomiclabs/buidler-ethers");
usePlugin("@nomiclabs/buidler-truffle5");

module.exports = {
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      timeout: 1000000,
    },
    coverage: {
      url: "http://localhost:8555",
    },
    mainnet: {
      url: 'https://mainnet.infura.io/v3/' + process.env.INFURA_API_KEY,
      gasPrice: 500e9,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
    kovan: {
      url: 'https://kovan.infura.io/v3/' + process.env.INFURA_API_KEY,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    }
  },
  solc: {
    version: "0.6.6",
    optimizer: {
      enabled: true,
      runs: 999999,
    },
  },
  mocha: {
    timeout: 1000000,
  }
};
