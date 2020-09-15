module.exports = async ({ getNamedAccounts, deployments, getChainId }) {
  const { deploy } = deployments;
  const { deployer, admin } = await getNamedAccounts();
};
