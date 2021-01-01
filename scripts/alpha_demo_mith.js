require("dotenv").config();
const hre = require("hardhat");
const { ethers, network } = hre;
const { argv } = require("yargs");
const {
  getDeployedAddress,
  bytes32,
  getStablecoinAddress,
} = require("../utils/helpers.js");
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

  console.log("Protocol addresses:");
  const micDaiPoolAddress = legos.mith.addresses.MICDAIPool;
  const micUsdcPoolAddress = legos.mith.addresses.MICUSDCPool;
  const micUsdtPoolAddress = legos.mith.addresses.MICUSDTPool;
  const micDaiPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micDaiPoolAddress
  );
  console.log("MIC-DAI Pool/Token:", micDaiPoolAddress);
  const micUsdcPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micUsdcPoolAddress
  );
  console.log("MIC-USDC Pool/Token:", micDaiPoolAddress);
  const micUsdtPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micUsdtPoolAddress
  );
  console.log("MIC-USDT Pool/Token:", micDaiPoolAddress);
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
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const stablecoinAddress = getStablecoinAddress(symbol, NETWORK_NAME);
    stablecoins[symbol] = await ethers.getContractAt(
      "IDetailedERC20",
      stablecoinAddress
    );
  }

  console.log("Strategy balances (before):");
  const daiAmount = (
    await stablecoins["DAI"].balanceOf(strategyAddress)
  ).toString();
  const usdcAmount = (
    await stablecoins["USDC"].balanceOf(strategyAddress)
  ).toString();
  const usdtAmount = (
    await stablecoins["USDT"].balanceOf(strategyAddress)
  ).toString();
  console.log("DAI:", daiAmount);
  console.log("USDC:", usdcAmount);
  console.log("USDT:", usdtAmount);
  console.log(
    "MIC-DAI:",
    (await micDaiPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-USDC:",
    (await micUsdcPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-USDT:",
    (await micUsdtPoolToken.balanceOf(strategyAddress)).toString()
  );

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

  const trx = await manager.execute(strategyAddress, data, {
    gasLimit: 9e6,
  });
  await trx.wait();
  console.log("Strategy balances (after):");
  console.log(
    "DAI:",
    (await stablecoins["DAI"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDC:",
    (await stablecoins["USDC"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDT:",
    (await stablecoins["USDT"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-DAI:",
    (await micDaiPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-USDC:",
    (await micUsdcPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "MIC-USDT:",
    (await micUsdtPoolToken.balanceOf(strategyAddress)).toString()
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
