const {
  impersonateAdminSafe,
  getPoolIds,
  getRegisteredContract,
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

  return amountsFormatted;
}

if (!module.parent) {
  main()
    .then((amounts) => {
      console.log("");
      console.log(amounts);
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
