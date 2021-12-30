const {
  impersonateAdminSafe,
  getPoolIds,
  getRegisteredContract,
  getStablecoin,
  unlockOracleAdapter,
} = require("../frontend/utils");
const { formatUnits } = require("../../utils/helpers");

async function main() {
  const oracleAdapter = await getRegisteredContract("oracleAdapter");
  const isLocked = await oracleAdapter.isLocked();

  if (isLocked) {
    console.log("Oracle adapter was already locked, unlocking...");
    await unlockOracleAdapter();
  }

  const adminSafe = await impersonateAdminSafe();
  const mapt = await getRegisteredContract("mApt", adminSafe);

  let poolIds = getPoolIds();

  console.log("Getting rebalance amounts...");
  const amounts = await mapt.getRebalanceAmounts(poolIds);

  let amountsFormatted = [];
  amountsFormatted[0] = formatUnits(amounts[1][0], 18);
  amountsFormatted[1] = formatUnits(amounts[1][1], 6);
  amountsFormatted[2] = formatUnits(amounts[1][2], 6);

  const lpAccount = await getRegisteredContract("lpAccount");

  const dai = await getStablecoin("DAI");
  const daiBalance = await dai.balanceOf(lpAccount.address);
  const daiToUnwind = amounts[1][0].sub(daiBalance);

  const usdc = await getStablecoin("USDC");
  const usdcBalance = await usdc.balanceOf(lpAccount.address);
  const usdcToUnwind = amounts[1][1].sub(usdcBalance);

  const usdt = await getStablecoin("USDT");
  const usdtBalance = await usdt.balanceOf(lpAccount.address);
  const usdtToUnwind = amounts[1][2].sub(usdtBalance);

  let toUnwindFormatted = [];
  toUnwindFormatted[0] = formatUnits(daiToUnwind, 18);
  toUnwindFormatted[1] = formatUnits(usdcToUnwind, 6);
  toUnwindFormatted[2] = formatUnits(usdtToUnwind, 6);

  return { amountsFormatted, toUnwindFormatted };
}

if (!module.parent) {
  main()
    .then((amountsFormatted, toUnwindFormatted) => {
      console.log("");
      console.log(amountsFormatted);
      console.log(toUnwindFormatted);
      console.log("");
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
