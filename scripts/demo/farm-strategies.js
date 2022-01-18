const _ = require("lodash");
const { argv } = require("yargs").option("months", {
  type: "number",
  default: 1,
  description: "Number of months to farm",
});
const hre = require("hardhat");

async function main(argv) {
  const stakeTime = 60 * 60 * 24 * 30 * argv.months; // 1 month
  await hre.network.provider.send("evm_increaseTime", [stakeTime]);
  // advance a few blocks just in case
  await Promise.all(
    _.range(10).map(() => hre.network.provider.send("evm_mine"))
  );
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log(`Time advanced by ${argv.months} month`);
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
