module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer, admin } = await getNamedAccounts();

  const implementation = await deploy("APYLiquidityPoolImplementation", {
    from: deployer,
  });

  const deployment = await deploy("APYLiquidityPoolProxy", {
    from: deployer,
    args: [implementation.address, admin]
  });
};
