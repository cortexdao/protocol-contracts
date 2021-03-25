require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  getGasPrice,
  getDeployedAddress,
  updateDeployJsons,
} = require("../../utils/helpers");
const { AGG_MAP } = require("../../utils/constants");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const POOL_MNEMONIC = process.env.POOL_MNEMONIC;
  const poolDeployer = ethers.Wallet.fromMnemonic(POOL_MNEMONIC).connect(
    ethers.provider
  );
  console.log("Deployer address:", poolDeployer.address);
  /* TESTING on localhost only
   * useful if running out of ETH for deployer address
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: poolDeployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(poolDeployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Upgrading pools ...");
  console.log("");

  let gasUsed = BigNumber.from("0");

  const proxyAdminAddress = getDeployedAddress(
    "PoolTokenProxyAdmin",
    networkName
  );
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    proxyAdminAddress,
    poolDeployer
  );

  const PoolTokenV2 = await ethers.getContractFactory(
    "PoolTokenV2",
    poolDeployer
  );
  let gasPrice = await getGasPrice(argv.gasPrice);
  const logicV2 = await PoolTokenV2.connect(poolDeployer).deploy({
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logicV2.deployTransaction.hash}`
  );
  let receipt = await logicV2.deployTransaction.wait();
  console.log(`Pool logic V2: ${chalk.green(logicV2.address)}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  const mAPTAddress = getDeployedAddress("MetaPoolToken", networkName);
  const initData = PoolTokenV2.interface.encodeFunctionData(
    "initializeUpgrade(address)",
    [mAPTAddress]
  );

  const deployData = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_PoolTokenProxy",
      networkName
    );
    console.log(`${symbol} Pool: ${chalk.green(poolAddress)}`);

    gasPrice = await getGasPrice(argv.gasPrice);
    const trx = await proxyAdmin
      .connect(poolDeployer)
      .upgradeAndCall(poolAddress, logicV2.address, initData, { gasPrice });
    console.log("Upgrade:", `https://etherscan.io/tx/${trx.hash}`);
    receipt = await trx.wait();
    console.log("... pool upgraded.");
    console.log("");
    gasUsed = gasUsed.add(receipt.gasUsed);

    deployData[symbol + "_PoolToken"] = logicV2.address;
  }
  updateDeployJsons(networkName, deployData);

  console.log("");
  console.log("Set USD aggs on pools ...");
  console.log("");

  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_PoolTokenProxy",
      networkName
    );
    console.log(`${symbol} pool:`, chalk.green(poolAddress));
    const gasPrice = await getGasPrice(argv.gasPrice);
    const pool = await ethers.getContractAt(
      "PoolTokenV2",
      poolAddress,
      poolDeployer
    );
    const aggAddress = AGG_MAP[networkName][`${symbol}-USD`];
    const trx = await pool.setPriceAggregator(aggAddress, { gasPrice });
    console.log("Set USD agg:", `https://etherscan.io/tx/${trx.hash}`);
    const receipt = await trx.wait();
    console.log("");
    gasUsed = gasUsed.add(receipt.gasUsed);
  }

  console.log("");
  console.log("Approving manager for pools ...");
  console.log("");

  const poolManagerAddress = getDeployedAddress(
    "PoolManagerProxy",
    networkName
  );
  console.log("Pool Manager:", chalk.green(poolManagerAddress));
  console.log("");
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_PoolTokenProxy",
      networkName
    );
    console.log(`${symbol} pool:`, chalk.green(poolAddress));
    const gasPrice = await getGasPrice(argv.gasPrice);
    const pool = await ethers.getContractAt(
      "PoolTokenV2",
      poolAddress,
      poolDeployer
    );
    const trx = await pool.infiniteApprove(poolManagerAddress, { gasPrice });
    console.log("Approve:", `https://etherscan.io/tx/${trx.hash}`);
    const receipt = await trx.wait();
    console.log("");
    gasUsed = gasUsed.add(receipt.gasUsed);
  }
  console.log("Total gas used:", gasUsed.toString());

  if (["KOVAN", "MAINNET"].includes(networkName)) {
    console.log("");
    console.log("Verifying on Etherscan ...");
    await ethers.provider.waitForTransaction(logicV2.deployTransaction.hash, 5); // wait for Etherscan to catch up
    await hre.run("verify:verify", {
      address: logicV2.address,
    });
    console.log("");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Upgrades successful.");
      console.log("");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
