const hre = require("hardhat");
const { ethers } = hre;

/**
 * Impersonate an account through either Hardhat node or Ganache.
 * @param {address|signer|contract} account - an "account-like" object
 *    with either a `getAddress` function or `address` property.
 *    Allowed to be an address string.
 */
async function impersonateAccount(account) {
  const address = await getAddress(account);
  try {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
  } catch {
    // fallback to ganache method
    await hre.network.provider.request({
      method: "evm_unlockUnknownAccount",
      params: [address],
    });
  }
}

async function getAddress(object) {
  if (ethers.Signer.isSigner(object)) {
    return await object.getAddress();
  } else if (typeof object === "object" && "address" in object) {
    return object.address;
  } else if (typeof object === "string") {
    return ethers.utils.getAddress(object);
  } else {
    throw new Error("getAddress: argument type is not recognized.");
  }
}

module.exports = {
  impersonateAccount,
  getAddress,
};
