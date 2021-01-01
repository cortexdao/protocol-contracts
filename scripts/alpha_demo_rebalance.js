require("dotenv").config();
const hre = require("hardhat");
const { ethers, network, web3 } = hre;
const { argv } = require("yargs");
const { getDeployedAddress, erc20, bytes32 } = require("../utils/helpers.js");
const { ether, send } = require("@openzeppelin/test-helpers");
const { WHALE_ADDRESSES } = require("../utils/constants.js");

async function acquireToken(fundAccount, receiver, token, amount) {
  /* NOTE: Ganache is setup to control "whale" addresses. This method moves
  requested funds out of the fund account and into the specified wallet */

  amount = amount.toString();
  const fundAccountSigner = await ethers.provider.getSigner(fundAccount);
  const trx = await token.connect(fundAccountSigner).transfer(receiver, amount);
  trx.wait();
  const tokenBal = await token.balanceOf(receiver);
  console.log(`${token.address} Balance: ${tokenBal.toString()}`);
}

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

  await manager.setStrategyId(bytes32("curve_y"), strategyAddress);

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

  console.log("Acquire extra funds for testing ...");
  for (const [symbol, pool] of Object.entries(pools)) {
    const token = stablecoins[symbol];
    const amount = erc20("100000", await token.decimals());
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [WHALE_ADDRESSES[symbol]],
    });
    await send.ether(deployer, WHALE_ADDRESSES[symbol], ether("1"));
    await acquireToken(WHALE_ADDRESSES[symbol], pool.address, token, amount);
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
