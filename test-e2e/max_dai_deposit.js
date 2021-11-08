const hre = require("hardhat");
const { ethers } = hre;
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  getStablecoinAddress,
  forciblySendEth,
} = require("../utils/helpers");

async function main() {
  const [deployer] = await ethers.getSigners();

  const lpSafe = await impersonateAccount(
    "0x5b79121EA6dC2395B8046eCDCE14D66c2bF221B0"
  );
  const lpAccount = await ethers.getContractAt(
    "LpAccount",
    "0x026544DACFAfC3422A0219cb6Be03ecB5D99a771",
    lpSafe
  );
  await forciblySendEth(lpSafe, tokenAmountToBigNumber(10), deployer);

  const DAI_ADDRESS = getStablecoinAddress("DAI", "MAINNET");
  const daiToken = await ethers.getContractAt("IDetailedERC20", DAI_ADDRESS);
  const daiBalance = await daiToken.balanceOf(lpAccount.address);
  console.log("DAI balance: %s", await daiToken.balanceOf(lpAccount.address));

  const name = "curve-saave";

  const amounts = [daiBalance, 0];
  await lpAccount.deployStrategy(name, amounts);

  console.log(
    "New DAI balance: %s",
    await daiToken.balanceOf(lpAccount.address)
  );
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
