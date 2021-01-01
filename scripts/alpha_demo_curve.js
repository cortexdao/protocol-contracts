require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, bytes32 } = require("../utils/helpers.js");
const { expectEvent } = require("@openzeppelin/test-helpers");
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

  const depositY = legos.curvefi.addresses.Deposit_Y;
  console.log("Y Deposit:", legos.curvefi.addresses.Deposit_Y);

  const data = [
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

  const yPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
  );
  console.log("Y Pool:", legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD);
  console.log(
    "LP token:",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
  );
  console.log("");

  const trx = await manager.execute(strategyAddress, data, {
    gasLimit: 9e6,
  });
  await trx.wait();
  // // const trx = await manager.transferAndExecute(strategyAddress, data);
  console.log(
    "LP token balance:",
    (await yPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "DAI balance:",
    (await stablecoins["DAI"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDC balance:",
    (await stablecoins["USDC"].balanceOf(strategyAddress)).toString()
  );
  console.log(
    "USDT balance:",
    (await stablecoins["USDT"].balanceOf(strategyAddress)).toString()
  );

  const stableSwapY = new web3.eth.Contract(
    legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
  );
  await expectEvent.inTransaction(trx.hash, stableSwapY, "AddLiquidity");
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
