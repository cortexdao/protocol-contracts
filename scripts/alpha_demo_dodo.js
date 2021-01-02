require("dotenv").config();
const chalk = require("chalk");
const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const {
  getDeployedAddress,
  bytes32,
  getStablecoinAddress,
} = require("../utils/helpers.js");
const legos = require("@apy-finance/defi-legos");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  console.log("-------------DODO-------------");
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", chalk.green(deployer));

  console.log("Protocol addresses:");

  const usdtDlpAddress = legos.dodo.addresses.USDT_DLP;
  const usdtDlpToken = await ethers.getContractAt(
    "IDetailedERC20",
    usdtDlpAddress
  );
  console.log("DODO USDT DLP Token:", chalk.green(usdtDlpAddress));

  const usdcDlpAddress = legos.dodo.addresses.USDC_DLP;
  const usdcDlpToken = await ethers.getContractAt(
    "IDetailedERC20",
    usdcDlpAddress
  );
  console.log("DODO USDC DLP Token:", chalk.green(usdcDlpAddress));

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

  const manager = APYManager.attach(managerProxyAddress).connect(managerSigner);

  const strategyAddress = await manager.getStrategy(bytes32("curve_y"));
  console.log("Strategy address:", chalk.green(strategyAddress));

  const stablecoins = {};
  for (const symbol of ["USDC", "USDT"]) {
    const stablecoinAddress = getStablecoinAddress(symbol, NETWORK_NAME);
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      stablecoinAddress
    );
  }

  console.log("Strategy balances (before):");
  const usdcAmount = argv.usdcBal
    ? argv.usdcBal
    : (await stablecoins["USDC"].balanceOf(strategyAddress)).toString();
  const usdtAmount = argv.usdtBal
    ? argv.usdtBal
    : (await stablecoins["USDT"].balanceOf(strategyAddress)).toString();
  console.log("\tUSDC:", chalk.yellow(usdcAmount));
  console.log("\tUSDT:", chalk.yellow(usdtAmount));
  console.log(
    "\tUSDC DLP:",
    chalk.yellow((await usdcDlpToken.balanceOf(strategyAddress)).toString())
  );
  console.log(
    "\tUSDT DLP:",
    chalk.yellow((await usdtDlpToken.balanceOf(strategyAddress)).toString())
  );

  const addLiquidityData = [
    [
      stablecoins["USDC"].address,
      legos.maker.codecs.DAI.encodeApprove(
        legos.dodo.addresses.USDT_USDC_DODO,
        usdcAmount
      ),
    ],
    [
      legos.dodo.addresses.USDT_USDC_DODO,
      legos.dodo.codecs.USDT_USDC_DODO.encodeDepositQuote(usdcAmount),
    ],
    [
      stablecoins["USDT"].address,
      legos.maker.codecs.DAI.encodeApprove(
        legos.dodo.addresses.USDT_USDC_DODO,
        usdtAmount
      ),
    ],
    [
      legos.dodo.addresses.USDT_USDC_DODO,
      legos.dodo.codecs.USDT_USDC_DODO.encodeDepositBase(usdtAmount),
    ],
  ];

  const liquidityTrx = await manager.execute(
    strategyAddress,
    addLiquidityData,
    {
      gasLimit: 9e6,
    }
  );
  await liquidityTrx.wait();
  console.log("Strategy balances (after):");
  console.log(
    "\tUSDC:",
    chalk.yellow(
      (await stablecoins["USDC"].balanceOf(strategyAddress)).toString()
    )
  );
  console.log(
    "\tUSDT:",
    chalk.yellow(
      (await stablecoins["USDT"].balanceOf(strategyAddress)).toString()
    )
  );

  const usdcDlpAmount = await usdcDlpToken.balanceOf(strategyAddress);
  console.log("\tUSDC DLP:", chalk.yellow(usdcDlpAmount.toString()));

  const usdtDlpAmount = await usdtDlpToken.balanceOf(strategyAddress);
  console.log("\tUSDT DLP:", chalk.yellow(usdtDlpAmount.toString()));

  const stakingData = [
    [
      legos.dodo.addresses.USDC_DLP,
      legos.maker.codecs.DAI.encodeApprove(
        legos.dodo.addresses.DODO_MINE,
        usdcDlpAmount
      ),
    ],
    [
      legos.dodo.addresses.DODO_MINE,
      legos.dodo.codecs.DODO_MINE.encodeDeposit(
        legos.dodo.addresses.USDC_DLP,
        usdcDlpAmount
      ),
    ],
    [
      legos.dodo.addresses.USDT_DLP,
      legos.maker.codecs.DAI.encodeApprove(
        legos.dodo.addresses.DODO_MINE,
        usdtDlpAmount
      ),
    ],
    [
      legos.dodo.addresses.DODO_MINE,
      legos.dodo.codecs.DODO_MINE.encodeDeposit(
        legos.dodo.addresses.USDT_DLP,
        usdtDlpAmount
      ),
    ],
  ];

  const stakingTrx = await manager.execute(strategyAddress, stakingData, {
    gasLimit: 9e6,
  });
  await stakingTrx.wait();
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
