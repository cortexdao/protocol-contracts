const hre = require("hardhat");
const { ethers } = hre;
const { argv } = require("yargs");
const { acquireToken, console } = require("../../utils/helpers");

console.debugging = true;

const BALANCER_POOL_ADDRESS = "0xbc8b1f78ff5a0baf9945e145832ad79c494d4cf6";
const UNISWAP_POOL_ADDRESS = "0xf043c39a106db6b58c76995f30ba35fd211c3b76";
const LBP_DEPLOYER = "0xC98A0A4d9D9F789b86f03AbfdcEaEE7e3538e3dF";

async function main(argv) {
  await hre.run("compile");
  console.log("Acquire staking pool tokens for testing ...");
  const bpt = await ethers.getContractAt(
    "IDetailedERC20UpgradeSafe",
    BALANCER_POOL_ADDRESS
  );
  const uniV2 = await ethers.getContractAt(
    "IDetailedERC20UpgradeSafe",
    UNISWAP_POOL_ADDRESS
  );

  const testAccountIndex = argv.accountIndex || 0;
  console.log("Account index:", testAccountIndex);
  const signers = await ethers.getSigners();
  const tester = await signers[testAccountIndex].getAddress();
  console.log("Recipient address:", tester);

  const amount = argv.amount || "50";
  console.log("Amount:", amount);

  const sender = LBP_DEPLOYER;
  await acquireToken(sender, tester, bpt, amount, tester);
  await acquireToken(sender, tester, uniV2, amount, tester);
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
