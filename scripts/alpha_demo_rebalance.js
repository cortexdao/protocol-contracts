require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { getDeployedAddress } = require("../utils/helpers.js");

const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require("defi-legos");
const { dai } = require("../utils/helpers");

async function main() {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log("Deployer address:", deployer);
  console.log("");

  const poolProxyAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const poolOwnerAddress = await ProxyAdmin.attach(
    poolProxyAdminAddress
  ).owner();
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [poolOwnerAddress],
  });
  const poolSigner = await ethers.provider.getSigner(poolOwnerAddress);
  console.log("");
  console.log("Pool deployer address:", await poolSigner.getAddress());
  console.log("");

  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: poolOwnerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  const pools = {};
  const stablecoins = {};
  const APYPoolToken = (
    await ethers.getContractFactory("APYPoolToken")
  ).connect(poolSigner);
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
  console.log("");
  console.log("Manager deployer address:", await managerSigner.getAddress());
  console.log("");
  /* For testing only */
  if (NETWORK_NAME === "LOCALHOST") {
    await web3.eth.sendTransaction({
      from: deployer,
      to: managerOwnerAddress,
      value: 1e18,
    });
  }
  /* *************** */

  const manager = APYManager.attach(managerProxyAddress).connect(managerSigner);

  console.log("Approving manager for pools ...");
  for (const [symbol, pool] of Object.entries(pools)) {
    console.log("  pool:", symbol);
    await pool.revokeApprove(manager.address);
    await pool.infiniteApprove(manager.address);
  }
  console.log("... done.");
  console.log("");

  const GenericExecutor = (
    await ethers.getContractFactory("APYGenericExecutor")
  ).connect(managerSigner);
  const genericExecutor = await GenericExecutor.deploy();
  await genericExecutor.deployed();
  console.log("Executor address:", genericExecutor.address);
  const strategyAddress = await manager.callStatic.deploy(
    genericExecutor.address
  );
  await manager.deploy(genericExecutor.address);
  console.log("Strategy address:", strategyAddress);
  console.log("");

  // TODO: when testing on same forked mainnet, this will only show
  // funds tranferred the first time, as subsequent times the pools
  // will have zero funds
  console.log("Transferring funds to strategy ...");
  for (const [symbol, pool] of Object.entries(pools)) {
    console.log("  pool:", symbol);
    console.log(
      "    before:",
      (await stablecoins[symbol].balanceOf(strategyAddress)).toString()
    );
    const trx = await manager.transferFunds(pool.address, strategyAddress);
    await trx.wait();
    console.log(
      "    after:",
      (await stablecoins[symbol].balanceOf(strategyAddress)).toString()
    );
  }
  console.log("... done.");
  console.log("");
  await manager.deploy(genericExecutor.address);

  const depositAmount = dai("100000").toString();
  console.log("Strategy address:", strategyAddress);
  console.log("Y deposit:", legos.curvefi.addresses.DEPOSIT_Y);
  const depositY = legos.curvefi.addresses.DEPOSIT_Y;
  const data = [
    [
      stablecoins["DAI"].address,
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
    (await stablecoins["DAI"].balanceOf(strategyAddress)).toString()
  );
  // const receipt = await web3.eth.getTransactionReceipt(trx.tx);
  // console.log(receipt.logs);

  const stableSwapY = new web3.eth.Contract(
    legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
    legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
  );
  await expectEvent.inTransaction(trx.hash, stableSwapY, "AddLiquidity");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
