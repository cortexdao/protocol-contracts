const {
  SafeService,
  SafeEthersSigner,
} = require("@gnosis.pm/safe-ethers-adapters");

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
 * @proposedTx Transaction response from calling function
 * @safeService SafeService instance (can be handily obtained via safeSigner.service)
 */
async function waitForSafeTxDetails(proposedTx, safeService) {
  console.log(
    "USER ACTION REQUIRED: Use the Gnosis Safe UI to confirm transaction"
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log("Waiting for transaction details ...");
    try {
      const safeTxHash = proposedTx.hash;
      const txDetails = await safeService.getSafeTxDetails(safeTxHash);
      if (txDetails.transactionHash) break;
    } catch (e) {
      console.log(e);
    }
    await sleep(5000);
  }
  const receipt = await proposedTx.wait();
  return receipt;
}

module.exports = {
  getSafeSigner,
  waitForSafeTxDetails,
};
