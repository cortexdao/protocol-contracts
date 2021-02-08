/* eslint-disable no-console */
const upgradePoolsLogic = require("./upgrade_pools_logic");
const poolsApprovals = require("./pool_approvals");
const upgradeManagerLogic = require("./upgrade_manager");
const deployGenericExecutor = require("./deploy_generic_executor");
const deployNewStrategy = require("./deploy_new_strategy");

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
