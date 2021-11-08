const hre = require("hardhat");
const { ethers } = hre;
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  forciblySendEth,
} = require("../utils/helpers");

async function main() {
  const [deployer] = await ethers.getSigners();

  const emergencySafe = await impersonateAccount(
    "0xEf17933d32e07a5b789405Bd197F02D6BB393147"
  );
  await forciblySendEth(emergencySafe, tokenAmountToBigNumber(10), deployer);

  const oracleAdapter = await ethers.getContractAt(
    "OracleAdapter",
    "0xb8dacbb5e038e5e033dbbb090d535c763c54ec05",
    emergencySafe
  );
  await oracleAdapter.unlock();
}

if (!module.parent) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
