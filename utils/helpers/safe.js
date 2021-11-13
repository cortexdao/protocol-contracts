const readline = require("readline");
const axios = require("axios");
const axiosRetry = require("axios-retry");
const {
  SafeService,
  SafeEthersSigner,
} = require("@gnosis.pm/safe-ethers-adapters");
const hre = require("hardhat");
const { ethers } = hre;

const MAINNET_SERVICE_URL = "https://safe-transaction.gnosis.io/";

const sleep = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

function configureAxiosRetry(axios, retries) {
  axiosRetry(axios, {
    retries: retries || 3, // number of retries
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      // if retry condition is not specified, by default idempotent requests are retried
      return 500 <= error.response.status;
    },
  });
}

function promptUser(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/*
 * @param safeAddress address of the Gnosis Safe
 * @param owner Ethers signer for an owner of the Safe
 */
async function getSafeSigner(safeAddress, owner) {
  configureAxiosRetry(axios);
  const service = new SafeService(MAINNET_SERVICE_URL, axios);
  const safeSigner = await SafeEthersSigner.create(safeAddress, owner, service);
  return safeSigner;
}

/*
 * @param proposedTx Transaction response from calling function
 * @param safeService SafeService instance (can be handily obtained via safeSigner.service)
 * @param confirmations number of confirmations to wait for
 * @param pollingDelay seconds to wait before making another request
 * @param timeout seconds to wait before giving up on current request
 */
async function waitForSafeTxDetails(
  proposedTx,
  safeService,
  confirmations,
  pollingDelay,
  timeout
) {
  console.log(
    "USER ACTION REQUIRED: Use the Gnosis Safe UI to confirm transaction"
  );

  confirmations = confirmations || 0;
  pollingDelay = (pollingDelay || 5) * 1000; // convert to milliseconds
  timeout = (timeout || 5) * 1000; // convert to milliseconds

  const answer = await promptUser("Continue? (y/n)");
  if (answer.toLowerCase().charAt(0) == "n") return;

  console.log("Waiting for transaction details ...");
  let txHash;
  while (!txHash) {
    process.stdout.write(".");
    try {
      const safeTxHash = proposedTx.hash;
      const txDetails = await safeService.getSafeTxDetails(safeTxHash);
      if (txDetails.transactionHash) {
        txHash = txDetails.transactionHash;
        console.log("");
        console.log("Got transaction hash: %s", txHash);
      }
    } catch (e) {
      logAxiosError(e);
    }
    await sleep(pollingDelay);
  }

  console.log("Waiting for transaction to be mined ...");
  let receipt;
  while (!receipt) {
    process.stdout.write(".");
    try {
      receipt = await ethers.provider.waitForTransaction(
        txHash,
        confirmations,
        timeout
      );
    } catch (e) {
      logAxiosError(e);
    }
    await sleep(pollingDelay);
  }
  return receipt;
}

function logAxiosError(error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const response = error.response;
    console.log("Status:", response.status, response.statusText);
  } else if (error.request) {
    // The request was made but no response was received
    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    // http.ClientRequest in node.js
    console.log(error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.log("Error:", error.message);
  }
}

module.exports = {
  getSafeSigner,
  waitForSafeTxDetails,
};
