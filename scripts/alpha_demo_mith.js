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
  console.log("-------------MITH-------------");
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", chalk.green(deployer));

  console.log("Protocol addresses:");
  const micDaiPoolAddress = legos.mith.addresses.MICDAIPool;
  const micUsdcPoolAddress = legos.mith.addresses.MICUSDCPool;
  const micUsdtPoolAddress = legos.mith.addresses.MICUSDTPool;
  const micDaiPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micDaiPoolAddress
  );
  console.log("MIC-DAI Pool/Token:", chalk.green(micDaiPoolAddress));
  const micUsdcPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micUsdcPoolAddress
  );
  console.log("MIC-USDC Pool/Token:", chalk.green(micDaiPoolAddress));
  const micUsdtPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micUsdtPoolAddress
  );
  console.log("MIC-USDT Pool/Token:", chalk.green(micDaiPoolAddress));
  console.log("");

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
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const stablecoinAddress = getStablecoinAddress(symbol, NETWORK_NAME);
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      stablecoinAddress
    );
  }

  console.log("Strategy balances (before):");
  const daiBalance = (
    await stablecoins["DAI"].balanceOf(strategyAddress)
  ).toString();
  const daiAmount = argv.daiBal || daiBalance;
  const usdcBalance = (
    await stablecoins["USDC"].balanceOf(strategyAddress)
  ).toString();
  const usdcAmount = argv.usdcBal || usdcBalance;
  const usdtBalance = (
    await stablecoins["USDT"].balanceOf(strategyAddress)
  ).toString();
  const usdtAmount = argv.usdtBal || usdtBalance;

  if (
    ethers.BigNumber.from(daiAmount).eq("0") &&
    ethers.BigNumber.from(usdcAmount).eq("0") &&
    ethers.BigNumber.from(usdtAmount).eq("0")
  ) {
    console.log("No liquidity available");
    return;
  }

  console.log("\tDAI:", chalk.yellow(daiBalance));
  console.log("\tUSDC:", chalk.yellow(usdcBalance));
  console.log("\tUSDT:", chalk.yellow(usdtBalance));
  console.log(
    "\tMIC-DAI:",
    chalk.yellow((await micDaiPoolToken.balanceOf(strategyAddress)).toString())
  );
  console.log(
    "\tMIC-USDC:",
    chalk.yellow((await micUsdcPoolToken.balanceOf(strategyAddress)).toString())
  );
  console.log(
    "\tMIC-USDT:",
    chalk.yellow((await micUsdtPoolToken.balanceOf(strategyAddress)).toString())
  );

  const data = [];
  if (daiAmount.gt("0")) {
    data.push([
      stablecoins["DAI"].address,
      legos.maker.codecs.DAI.encodeApprove(micDaiPoolAddress, daiAmount),
    ]);
    data.push([
      micDaiPoolAddress,
      legos.mith.codecs.MICDAIPool.encodeStake(daiAmount),
    ]);
  }
  if (usdcAmount.gt("0")) {
    data.push([
      stablecoins["USDC"].address,
      legos.maker.codecs.DAI.encodeApprove(micUsdcPoolAddress, usdcAmount),
    ]);
    data.push([
      micUsdcPoolAddress,
      legos.mith.codecs.MICUSDCPool.encodeStake(usdcAmount),
    ]);
  }
  if (usdtAmount.gt("0")) {
    data.push([
      stablecoins["USDT"].address,
      legos.maker.codecs.DAI.encodeApprove(micUsdtPoolAddress, usdtAmount),
    ]);
    data.push([
      micUsdtPoolAddress,
      legos.mith.codecs.MICUSDTPool.encodeStake(usdtAmount),
    ]);
  }

  const trx = await manager.execute(strategyAddress, data, {
    gasLimit: 9e6,
  });
  await trx.wait();
  console.log("Strategy balances (after):");
  console.log(
    "\tDAI:",
    chalk.yellow(
      (await stablecoins["DAI"].balanceOf(strategyAddress)).toString()
    )
  );
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
  console.log(
    "\tMIC-DAI:",
    chalk.yellow((await micDaiPoolToken.balanceOf(strategyAddress)).toString())
  );
  console.log(
    "\tMIC-USDC:",
    chalk.yellow((await micUsdcPoolToken.balanceOf(strategyAddress)).toString())
  );
  console.log(
    "\tMIC-USDT:",
    chalk.yellow((await micUsdtPoolToken.balanceOf(strategyAddress)).toString())
  );
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
