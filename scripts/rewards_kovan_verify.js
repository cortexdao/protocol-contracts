require("dotenv").config();
const hre = require("hardhat");
const { ethers, network } = hre;
const { CHAIN_IDS, DEPLOYS_JSON } = require("../utils/constants");

const TOKEN_ADDRESS = require(DEPLOYS_JSON["APYGovernanceTokenProxy"]);
const DISTRIBUTOR_ADDRESS = require(DEPLOYS_JSON["APYRewardDistributor"]);

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const SIGNER_MNEMONIC = process.env.SIGNER_MNEMONIC;
  const wallet = ethers.Wallet.fromMnemonic(SIGNER_MNEMONIC);
  const signerAddress = wallet.address;
  console.log("Signer address:", signerAddress);
  console.log("Private key:", wallet.privateKey);

  const apyAddress = TOKEN_ADDRESS[CHAIN_IDS[NETWORK_NAME]];
  const distributorAddress = DISTRIBUTOR_ADDRESS[CHAIN_IDS[NETWORK_NAME]];

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await hre.run("verify:verify", {
      address: distributorAddress,
      constructorArguments: [apyAddress, signerAddress],
    });
    console.log("");
  }
}

main()
  .then(() => {
    console.log("");
    console.log("Verification successful.");
    console.log("");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    console.log("");
    process.exit(1);
  });
