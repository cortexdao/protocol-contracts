require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, bytes32 } = require("../utils/helpers.js");
const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require("defi-legos");
const { dai } = require("../utils/helpers");

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

  const depositAmount = dai("100000").toString();
  console.log("Strategy address:", strategyAddress);
  console.log("Y deposit:", legos.curvefi.addresses.DEPOSIT_Y);
  const depositY = legos.curvefi.addresses.DEPOSIT_Y;

  const daiToken = await ethers.getContractAt(
    "IDetailedERC20",
    legos.maker.addresses.DAI
  );
  const data = [
    [
      legos.maker.addresses.DAI,
      legos.maker.codecs.DAI.encodeApprove(depositY, depositAmount),
    ],
    [
      depositY,
      legos.curvefi.codecs.DEPOSIT_Y.encodeAddLiquidity(
        [depositAmount, 0, 0, 0],
        dai("0").toString()
      ),
    ],
  ];

  const yPoolToken = await ethers.getContractAt(
    "IDetailedERC20",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
  );
  console.log(
    "Y Pool address:",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
  );
  console.log(
    "LP token address:",
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
  );

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
    (await daiToken.balanceOf(strategyAddress)).toString()
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
