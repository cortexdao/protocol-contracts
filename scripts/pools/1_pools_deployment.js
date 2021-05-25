require("dotenv").config();
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const chalk = require("chalk");
const hre = require("hardhat");
const { getGasPrice, getDeployedAddress } = require("../../utils/helpers");
const { ethers, network } = hre;
const { BigNumber } = ethers;
const { TOKEN_AGG_MAP } = require("../utils/constants");
const { updateDeployJsons } = require("../utils/helpers");

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
  console.log("Deploying alpha test pools ...");
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

  const PoolTokenProxy = await ethers.getContractFactory(
    "PoolTokenProxy",
    poolDeployer
  );

  const PoolTokenV2 = await ethers.getContractFactory(
    "PoolTokenV2",
    poolDeployer
  );
  let gasPrice = await getGasPrice(argv.gasPrice);
  const logic = await PoolTokenV2.connect(poolDeployer).deploy({
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${logic.deployTransaction.hash}`
  );
  let receipt = await logic.deployTransaction.wait();
  console.log(`Pool logic V2: ${chalk.green(logic.address)}`);
  console.log("");
  gasUsed = gasUsed.add(receipt.gasUsed);

  let deployData = {};
  deployData["PoolTokenV2"] = logic.address;

  console.log("Deploy pools ...");
  for (const { symbol, token, aggregator } of TOKEN_AGG_MAP[networkName]) {
    const proxy = await PoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      token,
      aggregator
    );
    console.log(`${symbol} proxy: ${proxy.address}`);
    console.log(`  logic: ${logic.address}`);
    console.log("  aggregator:", aggregator);
    console.log(
      "Etherscan:",
      `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
    );
    receipt = await proxy.deployTransaction.wait();
    gasUsed = gasUsed.add(receipt.gasUsed);

    deployData[symbol + "_PoolTokenProxy_" + "AlphaTest"] = proxy.address;

    const pool = await PoolTokenV2.attach(proxy.address);
    const trx = await pool.lock();
    await trx.wait();
    console.log(`  .. pool locked.`);
  }

  updateDeployJsons(networkName, deployData);

  console.log("");
  console.log("Total gas used:", gasUsed.toString());
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Deployment successful.");
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
