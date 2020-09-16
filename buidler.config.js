require("dotenv").config();

usePlugin("solidity-coverage");
usePlugin("@nomiclabs/buidler-ethers");
usePlugin("@nomiclabs/buidler-truffle5");
usePlugin("buidler-deploy");

function getEnv(env) {
  let value = process.env[env];

  if (typeof value == "undefined") {
    value = "";
    console.error(`WARNING: ${env} environment variable has not been set`);
  }

  return value;
}

const mainnetEndpoint = getEnv("MAINNET_ENDPOINT");
const mainnetMnemonic = getEnv("MAINNET_MNEMONIC");

const kovanEndpoint = getEnv("KOVAN_ENDPOINT");
const kovanMnemonic = getEnv("KOVAN_MNEMONIC");

module.exports = {
  networks: {
    mainnet: {
      url: mainnetEndpoint,
      chainId: 1,
      accounts: {
        mnemonic: mainnetMnemonic,
      },
    },
    kovan: {
      url: kovanEndpoint,
      chainId: 42,
      accounts: {
        mnemonic: kovanMnemonic,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      timeout: 1000000,
    },
    coverage: {
      url: "http://localhost:8555",
    },
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
  },
  paths: {
    deploy: "deploy",
    deployments: "deployments",
    imports: `imports`,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    admin: {
      default: 1,
    },
  },
};
