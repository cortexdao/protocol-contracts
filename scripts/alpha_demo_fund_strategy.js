require("dotenv").config();
const chalk = require("chalk");
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, bytes32 } = require("../utils/helpers.js");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  console.log("--------- FUND STRATEGY FROM POOL -----------");
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", chalk.green(deployer));

  const pools = {};
  const stablecoins = {};
  const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
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
  await web3.eth.sendTransaction({
    from: deployer,
    to: managerOwnerAddress,
    value: 1e18,
  });

  const manager = APYManager.attach(managerProxyAddress).connect(managerSigner);
  const strategyAddress = await manager.getStrategy(bytes32("curve_y"));
  console.log("Strategy address:", strategyAddress);
  console.log("");

  console.log("Transferring funds to strategy ...");
  const stablecoinBalances = {};
  for (const [symbol, pool] of Object.entries(pools)) {
    console.log("\tpool:", chalk.yellow(symbol));
    console.log(
      "\t\tbefore:",
      chalk.yellow(
        (await stablecoins[symbol].balanceOf(strategyAddress)).toString()
      )
    );
    const trx = await manager.transferFunds(pool.address, strategyAddress);
    await trx.wait();
    const balance = (
      await stablecoins[symbol].balanceOf(strategyAddress)
    ).toString();
    console.log("\t\tafter:", chalk.yellow(balance));
    stablecoinBalances[symbol] = balance;
  }

  return stablecoinBalances;
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
