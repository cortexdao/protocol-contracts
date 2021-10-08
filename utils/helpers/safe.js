const {
  SafeService,
  SafeEthersSigner,
} = require("@gnosis.pm/safe-ethers-adapters");
const hre = require("hardhat");
const { ethers } = hre;

const MAINNET_SERVICE_URL = "https://safe-transaction.gnosis.io/";

const sleep = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

/*
 * @param safeAddress address of the Gnosis Safe
 * @param owner Ethers signer for an owner of the Safe
 */
async function getSafeSigner(safeAddress, owner) {
  const service = new SafeService(MAINNET_SERVICE_URL);
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

  confirmations = confirmations || 1;
  pollingDelay = (pollingDelay || 5) * 1000; // convert to milliseconds
  timeout = (timeout || 15) * 1000; // convert to milliseconds

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
      console.log(e);
    }
    await sleep(pollingDelay);
  }

  console.log("Waiting for transaction to be mined ...");
  let receipt;
  while (!receipt) {
    receipt = await ethers.provider.waitForTransaction(
      txHash,
      confirmations,
      timeout
    );
    await sleep(pollingDelay);
  }
  return receipt;
}

module.exports = {
  getSafeSigner,
  waitForSafeTxDetails,
};
