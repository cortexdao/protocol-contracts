const _ = require("lodash");
const {
  impersonateLpSafe,
  getRegisteredContract,
  getDemoPoolIds,
  getStablecoin,
  unlockOracleAdapter,
} = require("../frontend/utils");

async function main() {
  const oracleAdapter = await getRegisteredContract("oracleAdapter");
  const isLocked = await oracleAdapter.isLocked();

  if (isLocked) {
    console.log("Oracle adapter was already locked, unlocking...");
    await unlockOracleAdapter();
  }

  const lpSafe = await impersonateLpSafe();
  const mapt = await getRegisteredContract("mApt", lpSafe);

  const poolIds = getDemoPoolIds();
  await mapt.fundLpAccount(poolIds);

  // This won't be necessary when the LpAccount is updated to handle shortened locks
  console.log("Unlocking oracle adapter after funding...");
  await unlockOracleAdapter();

  const lpAccount = await getRegisteredContract("lpAccount", lpSafe);

  const strategyNames = [
    "curve-aave",
    //"curve-saave", // Doesn't support USDC
    "curve-susdv2",
    "curve-usdt",
    "curve-compound",
    "curve-frax",
  ];

  const usdc = await getStablecoin("USDC");
  const usdcBalance = await usdc.balanceOf(lpAccount.address);
  const amount = usdcBalance.div(strategyNames.length);

  const strategyAmounts = [
    [0, amount, 0],
    //"curve-saave", // Doesn't support USDC
    [0, amount, 0, 0],
    [0, amount, 0],
    [0, amount],
    [0, 0, amount, 0],
  ];

  const strategies = _.zip(strategyNames, strategyAmounts);

  await Promise.all(
    strategies.map(async ([name, amounts]) => {
      console.log(`Deploying ${amount.toString()} to ${name}...`);
      await lpAccount.deployStrategy(name, amounts);
    })
  );

  console.log("Unlocking the oracle adapter after deploy...");
  await unlockOracleAdapter();
}

if (!module.parent) {
  main()
    .then(() => {
      console.log("");
      console.log("New deposits are deployed.");
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
