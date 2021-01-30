require("dotenv").config();
const chalk = require("chalk");
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, bytes32 } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  console.log("--------- DEPLOY STRATEGY AND APPROVE -----------");
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", chalk.green(deployer));

  const poolProxyAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const poolOwnerAddress = await ProxyAdmin.attach(
    poolProxyAdminAddress
  ).owner();
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [poolOwnerAddress],
  });
  const poolSigner = await ethers.provider.getSigner(poolOwnerAddress);
  console.log(
    "Pool deployer address:",
    chalk.green(await poolSigner.getAddress())
  );

  await web3.eth.sendTransaction({
    from: deployer,
    to: poolOwnerAddress,
    value: 1e18,
  });

  const pools = {};
  const stablecoins = {};
  const APYPoolToken = (
    await ethers.getContractFactory("APYPoolTokenV2")
  ).connect(poolSigner);
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const poolProxyAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    const pool = APYPoolToken.attach(poolProxyAddress);
    pools[symbol] = pool;
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      await pool.underlyer()
    );
  }

  const APYManager = await ethers.getContractFactory("APYManager");
  const managerProxyAddress = getDeployedAddress(
    "APYManagerProxy",
    NETWORK_NAME
  );
  const managerOwnerAddress = await APYManager.attach(
    managerProxyAddress
  ).owner();
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [managerOwnerAddress],
  });
  const managerSigner = await ethers.provider.getSigner(managerOwnerAddress);
  console.log(
    "Manager deployer address:",
    chalk.green(await managerSigner.getAddress())
  );
  await web3.eth.sendTransaction({
    from: deployer,
    to: managerOwnerAddress,
    value: 1e18,
  });

  const manager = APYManager.attach(managerProxyAddress).connect(managerSigner);

  console.log("Approving manager for pools ...");
  for (const [symbol, pool] of Object.entries(pools)) {
    console.log("\tpool:", chalk.yellow(symbol));
    await pool.revokeApprove(manager.address);
    await pool.infiniteApprove(manager.address);
  }

  const GenericExecutor = (
    await ethers.getContractFactory("APYGenericExecutor")
  ).connect(managerSigner);
  const genericExecutor = await GenericExecutor.deploy();
  await genericExecutor.deployed();
  console.log("Executor address:", chalk.green(genericExecutor.address));
  const strategyAddress = await manager.callStatic.deploy(
    genericExecutor.address
  );
  await manager.deploy(genericExecutor.address);
  console.log("Strategy address:", chalk.green(strategyAddress));

  await manager.setStrategyId(bytes32("curve_y"), strategyAddress);
}

if (!module.parent) {
  main(argv)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
}
