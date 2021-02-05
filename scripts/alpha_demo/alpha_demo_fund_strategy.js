require("dotenv").config();
const chalk = require("chalk");
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, bytes32 } = require("../../utils/helpers");
const legos = require("@apy-finance/defi-legos");

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
  console.log(`Strategy address: ${chalk.green(strategyAddress)}`);
  console.log("");

  console.log("Transferring funds to strategy ...");
  const DAI = await ethers.getContractAt(legos.maker.abis.DAI, legos.maker.addresses.DAI)
  const USDC = await ethers.getContractAt(legos.centre.abis.USDC_Logic, legos.centre.addresses.USDC)
  const USDT = await ethers.getContractAt(legos.tether.abis.USDT, legos.tether.addresses.USDT)

  const DAI_BAL = await DAI.balanceOf(legos.apy.addresses.APY_DAI_POOL)
  const USDC_BAL = await USDC.balanceOf(legos.apy.addresses.APY_USDC_POOL)
  const USDT_BAL = await USDT.balanceOf(legos.apy.addresses.APY_USDT_POOL)

  const strat_DAI_before = await DAI.balanceOf(strategyAddress)
  const strat_USDC_before = await USDC.balanceOf(strategyAddress)
  const strat_USDT_before = await USDT.balanceOf(strategyAddress)

  console.log(`Strat DAI Balance before: ${chalk.yellow(strat_DAI_before.toString())}`)
  console.log(`Strat USDC Balance before: ${chalk.yellow(strat_USDC_before.toString())}`)
  console.log(`Strat USDC Balance before: ${chalk.yellow(strat_USDT_before.toString())}`)

  await manager.fundStrategy(strategyAddress,
    [
      [
        legos.apy.addresses.APY_DAI_POOL,
        legos.apy.addresses.APY_USDC_POOL,
        legos.apy.addresses.APY_USDT_POOL
      ],
      [
        DAI_BAL,
        USDC_BAL,
        USDT_BAL
      ]
    ]
  )

  const strat_DAI_after = await DAI.balanceOf(strategyAddress)
  const strat_USDC_after = await USDC.balanceOf(strategyAddress)
  const strat_USDT_after = await USDT.balanceOf(strategyAddress)

  console.log(`Strat DAI Balance after: ${chalk.yellow(strat_DAI_after.toString())}`)
  console.log(`Strat USDC Balance after: ${chalk.yellow(strat_USDC_after.toString())}`)
  console.log(`Strat USDC Balance after: ${chalk.yellow(strat_USDT_after.toString())}`)

  return {
    DAI: strat_DAI_after.toString(),
    USDC: strat_DAI_after.toString(),
    USDT: strat_DAI_after.toString(),
  }
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
