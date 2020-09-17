const chainIdToAggregators = require("../config/addresses.json");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const chainId = await getChainId();
  console.log("Chain ID", chainId);

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const proxyAdmin = await deploy("ProxyAdmin", {
    from: deployer,
  });

  const logic = await deploy("APYLiquidityPoolImplementation", {
    from: deployer,
  });

  let pool = await deploy("APYLiquidityPoolProxy", {
    from: deployer,
    args: [logic.address, proxyAdmin.address],
  });
  pool = await APYLiquidityPoolImplementation.at(pool.address);

  // set admin address for initializer upgrade
  await pool.setAdminAddress(proxyAdmin.address, { from: deployer });

  // register each token and its price feed with pool
  const aggregators = chainIdToAggregators[chainId];
  for ({ token, aggregator } of aggregators) {
    await pool.addTokenSupport(token, aggregator, { from: deployer });
  }

  // execute only once
  return true;
};
