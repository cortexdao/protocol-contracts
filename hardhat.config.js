require("dotenv").config();

require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-etherscan");

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY,
        enabled: process.env.ENABLE_FORKING ? true : false,
      },
      accounts: {
        // default, include for explicitness
        // mnemonic: "test test test test test test test test test test test junk",
        // Due to this bug, need to use our own test mnemonic:
        // https://github.com/nomiclabs/hardhat/issues/1231
        mnemonic:
          "today column drill funny reduce toilet strategy jump assault arctic boss umbrella",
        // default: 20
        count: 10,
      },
      // default 9.5e6
      gasLimit: 12.5e6,
      // default 9.5e6
      blockGasLimit: 12.5e6,
      // default: 8 gwei
      gasPrice: 40e9,
    },
    localhost: {
      url: "http://localhost:8545",
      timeout: 1000000,
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
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
    },
  },
  mocha: {
    timeout: 1000000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
