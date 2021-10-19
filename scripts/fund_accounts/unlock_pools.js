const hre = require("hardhat");
const { ethers } = hre;
const { argv } = require("yargs");
const {
  console,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
} = require("../../utils/helpers");

console.debugging = true;

const DAI_DEMO_POOL = "0x687ef0ce82A681c13807Ae7A7518A70A147C22D8";
const USDC_DEMO_POOL = "0x34A9860a7F80E37105e6cf4D1E1e596Fe6Ff9B70";
const TETHER_DEMO_POOL = "0x26b8E441d7c0d0cc8b43Ad89e57e37613163e0CE";
const EMERGENCY_SAFE = "0xEf17933d32e07a5b789405Bd197F02D6BB393147";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const daiDemoPool = await ethers.getContractAt("PoolTokenV2", DAI_DEMO_POOL);
  const usdcDemoPool = await ethers.getContractAt(
    "PoolTokenV2",
    USDC_DEMO_POOL
  );
  const tetherDemoPool = await ethers.getContractAt(
    "PoolTokenV2",
    TETHER_DEMO_POOL
  );

  const emergencySafe = await impersonateAccount(EMERGENCY_SAFE);
  await forciblySendEth(
    emergencySafe.address,
    tokenAmountToBigNumber(1),
    deployer.address
  );

  console.log("Unlocking pools ...");
  await daiDemoPool.connect(emergencySafe).emergencyUnlockAddLiquidity();
  await usdcDemoPool.connect(emergencySafe).emergencyUnlockAddLiquidity();
  await tetherDemoPool.connect(emergencySafe).emergencyUnlockAddLiquidity();
  console.log("Done.");
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
