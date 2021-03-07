require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const assert = require("assert");
const chalk = require("chalk");
const {
  getGasPrice,
  getDeployedAddress,
  updateDeployJsons,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const POOL_MNEMONIC = process.env.POOL_MNEMONIC;
  const poolDeployer = ethers.Wallet.fromMnemonic(POOL_MNEMONIC).connect(
    ethers.provider
  );

  const balance =
    (await ethers.provider.getBalance(poolDeployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Upgrading pools ...");
  console.log("");

  const poolAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    poolAdminAddress,
    poolDeployer
  );
  assert.strictEqual(
    await proxyAdmin.owner(),
    poolDeployer.address,
    "MNEMONIC needs to be set to pool deployer."
  );

  const APYPoolTokenV2 = await ethers.getContractFactory(
    "APYPoolTokenV2",
    poolDeployer
  );
  let gasPrice = await getGasPrice(argv.gasPrice);
  const logicV2 = await APYPoolTokenV2.deploy({ gasPrice });
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${logicV2.deployTransaction.hash}`
  );
  await logicV2.deployed();
  console.log(`Pool logic V2: ${chalk.green(logicV2.address)}`);
  console.log("");

  const mAPTAddress = getDeployedAddress("APYMetaPoolToken", NETWORK_NAME);
  const initData = APYPoolTokenV2.interface.encodeFunctionData(
    "initializeUpgrade(address)",
    [mAPTAddress]
  );

  const deployData = {};
  for (const symbol of ["DAI", "USDC", "USDC"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    console.log(`${symbol} Pool: ${chalk.green(poolAddress)}`);

    gasPrice = await getGasPrice(argv.gasPrice);
    const trx = await proxyAdmin
      .connect(poolDeployer)
      .upgradeAndCall(poolAddress, logicV2.address, initData, { gasPrice });
    console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
    await trx.wait();
    console.log("... pool upgraded.");

    deployData[symbol + "_APYPoolToken"] = logicV2.address;
  }
  updateDeployJsons(NETWORK_NAME, deployData);

  if (["KOVAN", "MAINNET"].includes(NETWORK_NAME)) {
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
