const { argv } = require("yargs")
  .option("strategy", {
    type: "string",
    description: "The strategy name",
  })
  .option("amount", {
    type: "number",
    default: false,
    description: "Amount of USD to unwind",
  })
  .option("total", {
    type: "number",
    description: "Total USD value in strategy",
  });
const { MAX_UINT256 } = require("../../utils/helpers");
const {
  impersonateLpSafe,
  impersonateAdminSafe,
  getRegisteredContract,
  unlockOracleAdapter,
} = require("../frontend/utils");

async function main(argv) {
  const adminSafe = await impersonateAdminSafe();
  const oracleAdapter = await getRegisteredContract("oracleAdapter", adminSafe);
  const isLocked = await oracleAdapter.isLocked();

  if (isLocked) {
    console.log("Oracle adapter was already locked, unlocking...");
    await unlockOracleAdapter();
  }

  console.log("Ignoring Chainlink stale data...");
  await oracleAdapter.setChainlinkStalePeriod(MAX_UINT256);

  const lpSafe = await impersonateLpSafe();
  const lpAccount = await getRegisteredContract("lpAccount", lpSafe);

  const lpBalance = await lpAccount.getLpTokenBalance(argv.strategy);
  const lpAmountToUnwind = lpBalance.mul(argv.amount).div(argv.total);

  return lpAmountToUnwind;
}

if (!module.parent) {
  main(argv)
    .then((lpAmountToUnwind) => {
      console.log("");
      console.log(`LP Tokens to unwind: ${lpAmountToUnwind.toString()}`);
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
