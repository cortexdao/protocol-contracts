require("dotenv").config();
const chalk = require("chalk");

require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-contract-sizer");

const {
  TASK_COMPILE_SOLIDITY_LOG_COMPILATION_ERRORS,
} = require("hardhat/builtin-tasks/task-names");

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY,
        enabled: process.env.ENABLE_FORKING ? true : false,
        blockNumber: 13272943,
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
      // Used to allow test contracts that exceed the size
      // Production contracts should be checked with
      // `yarn hardhat size-contracts` to verify they are under the limit
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
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
    testnet: {
      url: "http://34.138.217.77:8545",
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

// eslint-disable-next-line no-undef
subtask(TASK_COMPILE_SOLIDITY_LOG_COMPILATION_ERRORS).setAction(
  async ({ output }) => {
    if ((output || {}).errors === undefined) {
      return;
    }

    for (const error of output.errors) {
      if (error.severity === "error") {
        const errorMessage =
          getFormattedInternalCompilerErrorMessage(error) ||
          error.formattedMessage;

        console.error(chalk.red(errorMessage));
      } else {
        // log error object; useful for figuring out filter rule
        // console.log(error);
        const file = error.sourceLocation.file;
        if (/FluxAggregator/.test(file)) continue;
        if (/^@/.test(file)) continue;
        console.warn(chalk.yellow(error.formattedMessage));
      }
    }

    const hasConsoleErrors = output.errors.some(isConsoleLogError);
    if (hasConsoleErrors) {
      console.error(
        chalk.red(
          `The console.log call you made isn’t supported. See https://hardhat.org/console-log for the list of supported methods.`
        )
      );
      console.log();
    }
  }
);

/* helper functions we had to copy over from
 * https://github.com/nomiclabs/hardhat/blob/master/packages/hardhat-core/src/builtin-tasks/compile.ts
 */
function getFormattedInternalCompilerErrorMessage(error) {
  if (error.formattedMessage.trim() !== "InternalCompilerError:") {
    return;
  }

  return `${error.type}: ${error.message}`.replace(/[:\s]*$/g, "").trim();
}

function isConsoleLogError(error) {
  return (
    error.type === "TypeError" &&
    typeof error.message === "string" &&
    error.message.includes("log") &&
    error.message.includes("type(library console)")
  );
}
/*  end helper functions */
