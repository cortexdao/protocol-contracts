require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const {
  getDeployedAddress,
  bytes32,
  getStablecoinAddress,
} = require("../utils/helpers.js");
const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require("@apy-finance/defi-legos");

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
  const yPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
  );
  const depositY = legos.curvefi.addresses.Deposit_Y;
  console.log("Y Deposit:", legos.curvefi.addresses.Deposit_Y);
  console.log("Y Pool:", legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD);
  console.log(
    "LP Token:",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
  );
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
  const daiAmount = (
    await stablecoins["DAI"].balanceOf(strategyAddress)
  ).toString();
  const usdcAmount = (
    await stablecoins["USDC"].balanceOf(strategyAddress)
  ).toString();
  const usdtAmount = (
    await stablecoins["USDT"].balanceOf(strategyAddress)
  ).toString();

  console.log("Strategy balances (before):");
  console.log(
    "LP token:",
    (await yPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log("DAI:", daiAmount);
  console.log("USDC:", usdcAmount);
  console.log("USDT:", usdtAmount);

  const addLiquidityData = [
    [
      stablecoins["DAI"].address,
      legos.maker.codecs.DAI.encodeApprove(depositY, daiAmount),
    ],
    [
      stablecoins["USDC"].address,
      legos.maker.codecs.DAI.encodeApprove(depositY, usdcAmount),
    ],
    [
      stablecoins["USDT"].address,
      legos.maker.codecs.DAI.encodeApprove(depositY, usdtAmount),
    ],
    [
      depositY,
      legos.curvefi.codecs.Deposit_Y.encodeAddLiquidity(
        [daiAmount, usdcAmount, usdtAmount, 0],
        0
      ),
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
    "LP token:",
    (await yPoolToken.balanceOf(strategyAddress)).toString()
  );
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

  const stableSwapY = new web3.eth.Contract(
    legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
  );
  await expectEvent.inTransaction(
    liquidityTrx.hash,
    stableSwapY,
    "AddLiquidity"
  );

  const lpBalance = await yPoolToken.balanceOf(strategyAddress);
  const depositData = [
    [
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token,
      legos.curvefi.codecs.yDAI_yUSDC_yUSDT_ytUSD_Token.encodeApprove(
        legos.curvefi.addresses.y_Liquidity_Gauge,
        lpBalance
      ),
    ],
    [
      legos.curvefi.addresses.y_Liquidity_Gauge,
      legos.curvefi.codecs.yLiquidityGauge.encodeDeposit(lpBalance),
    ],
  ];

  const depositTrx = await manager.execute(strategyAddress, depositData, {
    gasLimit: 9e6,
  });

  const yLiquidityGauge = new web3.eth.Contract(
    legos.curvefi.abis.yLiquidityGauge,
    legos.curvefi.addresses.y_Liquidity_Guage
  );
  await expectEvent.inTransaction(depositTrx.hash, yLiquidityGauge, "Deposit");
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
