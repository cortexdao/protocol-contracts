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

  const daiToken = await ethers.getContractAt(
    "IDetailedERC20",
    legos.maker.addresses.DAI
  );
  const depositAmount = (await daiToken.balanceOf(strategyAddress)).toString();

  const micDaiPoolAddress = legos.mith.addresses.MICDAIPool;
  const data = [
    [
      legos.maker.addresses.DAI,
      legos.maker.codecs.DAI.encodeApprove(micDaiPoolAddress, depositAmount),
    ],
    [
      micDaiPoolAddress,
      legos.mith.codecs.MICDAIPool.encodeStake(depositAmount),
    ],
  ];

  const micDaiPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    micDaiPoolAddress
  );
  console.log("LP token address:", micDaiPoolAddress);

  console.log(
    "DAI balance (before):",
    (await daiToken.balanceOf(strategyAddress)).toString()
  );

  const trx = await manager.execute(strategyAddress, data, {
    gasLimit: 9e6,
  });
  await trx.wait();
  console.log(
    "LP token balance:",
    (await micDaiPoolToken.balanceOf(strategyAddress)).toString()
  );
  console.log(
    "DAI balance (after):",
    (await daiToken.balanceOf(strategyAddress)).toString()
  );

  // const stableSwapY = new web3.eth.Contract(
  //   legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
  //   legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
  // );
  // await expectEvent.inTransaction(trx.hash, stableSwapY, "AddLiquidity");
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
