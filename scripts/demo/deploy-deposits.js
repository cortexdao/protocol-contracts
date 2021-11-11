const _ = require("lodash");
const { argv } = require("yargs").option("production", {
  type: "boolean",
  default: false,
  description:
    "Set to true to the production pools, false to use the demo pools",
});
const {
  impersonateLpSafe,
  getRegisteredContract,
  getDemoPoolIds,
  getPoolIds,
  getStablecoin,
  unlockOracleAdapter,
} = require("../frontend/utils");

async function main(argv) {
  const oracleAdapter = await getRegisteredContract("oracleAdapter");
  const isLocked = await oracleAdapter.isLocked();

  if (isLocked) {
    console.log("Oracle adapter was already locked, unlocking...");
    await unlockOracleAdapter();
  }

  const lpSafe = await impersonateLpSafe();
  const mapt = await getRegisteredContract("mApt", lpSafe);

  let poolIds;
  if (argv.production) {
    poolIds = getPoolIds();
  } else {
    poolIds = getDemoPoolIds();
  }

  console.log("Funding LP Account...");
  await mapt.fundLpAccount(poolIds);

  // This won't be necessary when the LpAccount is updated to handle shortened locks
  console.log("Unlocking oracle adapter after funding...");
  await unlockOracleAdapter();

  const lpAccount = await getRegisteredContract("lpAccount", lpSafe);

  const strategyNames = [
    "curve-aave",
    "curve-saave",
    "curve-susdv2",
    "curve-usdt",
    "curve-compound",
    "curve-frax",
  ];

  const dai = await getStablecoin("DAI");
  const daiBalance = await dai.balanceOf(lpAccount.address);
  const daiAmount = daiBalance.div(strategyNames.length);

  const usdc = await getStablecoin("USDC");
  const usdcBalance = await usdc.balanceOf(lpAccount.address);
  const usdcAmount = usdcBalance.div(strategyNames.length - 1);

  const usdt = await getStablecoin("USDT");
  const usdtBalance = await usdt.balanceOf(lpAccount.address);
  const usdtAmount = usdtBalance.div(strategyNames.length - 2);

  const strategyAmounts = [
    [daiAmount, usdcAmount, usdtAmount],
    [daiAmount, 0],
    [daiAmount, usdcAmount, usdtAmount, 0],
    [daiAmount, usdcAmount, usdtAmount],
    [daiAmount, usdcAmount],
    [0, daiAmount, usdcAmount, usdtAmount],
  ];

  const strategies = _.zip(strategyNames, strategyAmounts);

  if (argv.production) {
    for (const i in strategies) {
      const [name, amounts] = strategies[i];
      console.log(
        `Deploying ${amounts.map((a) => a.toString()).toString()} to ${name}...`
      );
      await lpAccount.deployStrategy(name, amounts);
    }
  } else {
    await Promise.all(
      strategies.map(async ([name, amounts]) => {
        console.log(
          `Deploying ${amounts
            .map((a) => a.toString())
            .toString()} to ${name}...`
        );
        await lpAccount.deployStrategy(name, amounts);
      })
    );
  }

  console.log("Unlocking the oracle adapter after deploy...");
  await unlockOracleAdapter();
}

if (!module.parent) {
  main(argv)
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
