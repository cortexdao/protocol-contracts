/* eslint-disable no-console */
const upgradePoolsLogic = require("./alpha/upgrade_pools_logic");
const poolsApprovals = require("./alpha/pool_approvals");
const upgradeManagerLogic = require("./alpha/upgrade_manager");
const deployGenericExecutor = require("./alpha/deploy_generic_executor");
const deployNewStrategy = require("./alpha/deploy_new_strategy");

// The following steps should be very similar to test-integration/APYPoolToken.js
const steps = [
  upgradePoolsLogic, // after update defi-legos
  poolsApprovals,
  upgradeManagerLogic, // after update defi-legos
  deployGenericExecutor, // after update defi-legos
  deployNewStrategy,
];

async function main() {
  await steps[0]();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
