const chainIdToAggregators = require("../config/addresses.json");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const chainId = await getChainId();
  console.log("Chain ID", chainId);

  const { deploy } = deployments;
  const { deployer, admin } = await getNamedAccounts();

  const logic = await deploy("APYLiquidityPoolImplementation", {
    from: deployer,
  });

  let pool = await deploy("APYLiquidityPoolProxy", {
    from: deployer,
    args: [logic.address, admin],
  });
  pool = await APYLiquidityPoolImplementation.at(pool.address);

  // set admin address for initializer upgrade
  await pool.setAdminAddress(admin, { from: deployer });

  // register each token and its price feed with pool
  const aggregators = chainIdToAggregators[chainId];
  for ({ token, aggregator } of aggregators) {
    await pool.addTokenSupport(token, aggregator, { from: deployer });
  }

  // execute only once
  return true;
};
