const { ethers } = require("@nomiclabs/buidler");

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  return;

  console.log("");
  console.log("Starting upgrade script...");
  const chainId = await getChainId();
  console.log("Chain ID:", chainId);
  console.log("");

  const { deploy, get, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  const proxy = await get("APYLiquidityPoolProxy");
  const logic = await deploy("APYLiquidityPoolImplementationV2", {
    from: deployer,
  });

  const data = new ethers.utils.Interface(logic.abi).encodeFunctionData(
    "initializeUpgrade",
    []
  );
  execute(
    "proxyAdmin",
    { from: deployer },
    "upgradeAndCall",
    proxy.address,
    logic.address,
    data
  );

  // execute deploy script only once
  // increment name of file, e.g., upgrade_2.js,
  // to upgrade to next version
  return true;
};
