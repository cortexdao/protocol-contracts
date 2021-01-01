require("dotenv").config();
const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, bytes32 } = require("../utils/helpers.js");
const legos = require("defi-legos");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
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
  console.log("");
  console.log("Manager deployer address:", await managerSigner.getAddress());
  console.log("");

  const manager = APYManager.attach(managerProxyAddress).connect(managerSigner);

  const strategyAddress = await manager.getStrategy(bytes32("curve_y"));
  console.log("Strategy address:", strategyAddress);
  console.log("");

  const stablecoins = {};
  const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const poolProxyAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    const pool = APYPoolToken.attach(poolProxyAddress);
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      await pool.underlyer()
    );
  }
  const daiAmount = (
    await stablecoins["DAI"].balanceOf(strategyAddress)
  ).toString();
  const usdcAmount = (
    await stablecoins["USDC"].balanceOf(strategyAddress)
  ).toString();
  const usdtAmount = (
    await stablecoins["USDT"].balanceOf(strategyAddress)
  ).toString();
  console.log("DAI balance:", daiAmount);
  console.log("USDC balance:", usdcAmount);
  console.log("USDT balance:", usdtAmount);

  const micDaiPoolAddress = legos.mith.addresses.MICDAIPool;
  const micUsdcPoolAddress = legos.mith.addresses.MICUSDCPool;
  const micUsdtPoolAddress = legos.mith.addresses.MICUSDTPool;
  const data = [
    [
      stablecoins["DAI"].address,
      legos.maker.codecs.DAI.encodeApprove(micDaiPoolAddress, daiAmount),
    ],
    [micDaiPoolAddress, legos.mith.codecs.MICDAIPool.encodeStake(daiAmount)],
    [
      stablecoins["USDC"].address,
      legos.maker.codecs.DAI.encodeApprove(micUsdcPoolAddress, usdcAmount),
    ],
    [micUsdcPoolAddress, legos.mith.codecs.MICDAIPool.encodeStake(usdcAmount)],
    [
      stablecoins["USDT"].address,
      legos.maker.codecs.DAI.encodeApprove(micUsdtPoolAddress, usdtAmount),
    ],
    [micUsdtPoolAddress, legos.mith.codecs.MICDAIPool.encodeStake(usdtAmount)],
  ];

  const micDaiPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micDaiPoolAddress
  );
  console.log("MIC-DAI token address:", micDaiPoolAddress);
  const micUsdcPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micUsdcPoolAddress
  );
  console.log("MIC-USDC token address:", micDaiPoolAddress);
  const micUsdtPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micUsdtPoolAddress
  );
  console.log("MIC-USDT token address:", micDaiPoolAddress);

  console.log(
    "DAI balance (before):",
    (await stablecoins["DAI"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDC balance (before):",
    (await stablecoins["USDC"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDT balance (before):",
    (await stablecoins["USDT"].balanceOf(strategyAddress)).toString()
  );

  const trx = await manager.execute(strategyAddress, data, {
    gasLimit: 9e6,
  });
  await trx.wait();
  console.log(
    "MIC-DAI token balance:",
    (await micDaiPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-USDC token balance:",
    (await micUsdcPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-USDT token balance:",
    (await micUsdtPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "DAI balance (after):",
    (await stablecoins["DAI"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDC balance (after):",
    (await stablecoins["USDC"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDT balance (after):",
    (await stablecoins["USDT"].balanceOf(strategyAddress)).toString()
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
