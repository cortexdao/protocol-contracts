const { MAX_UINT256 } = require("../../utils/helpers");
const {
  impersonateLpSafe,
  impersonateAdminSafe,
  getRegisteredContract,
  unlockOracleAdapter,
} = require("../frontend/utils");

async function main() {
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

  const strategyNames = [
    "curve-aave",
    "curve-saave",
    "curve-susdv2",
    "curve-usdt",
    "curve-compound",
    "curve-frax",
  ];

  await Promise.all(
    strategyNames.map(async (name) => {
      console.log(`Claiming from ${name}...`);
      await lpAccount.claim(name);
    })
  );

  console.log("Unlocking the oracle adapter after deploy...");
  await unlockOracleAdapter();
}

if (!module.parent) {
  main()
    .then(() => {
      console.log("");
      console.log("Reward tokens have been claimed.");
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
