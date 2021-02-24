const hre = require("hardhat");
const { ethers } = hre;

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
