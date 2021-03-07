const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const assert = require("assert");
const { ethers, network } = hre;
const chalk = require("chalk");
const { getDeployedAddress, getGasPrice } = require("../../utils/helpers");

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const proxyAdminAddress = getDeployedAddress(
    "APYManagerProxyAdmin",
    NETWORK_NAME
  );
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    proxyAdminAddress
  );
  assert.strictEqual(
    await proxyAdmin.owner(),
    deployer.address,
    "MNEMONIC needs to be set to pool deployer."
  );

  const proxyAddress = getDeployedAddress("APYManagerProxy", NETWORK_NAME);
  let proxy = await ethers.getContractAt("APYManager", proxyAddress);

  // Delete unneeded V1 storage
  let gasPrice = await getGasPrice(argv.gasPrice);
  let trx = await proxy.deleteTokenAddress({ gasPrice });
  console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await proxy.deletePoolIds({ gasPrice });
  console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();

  const APYManagerV2 = await ethers.getContractFactory("APYManagerV2");
  const logicV2 = await APYManagerV2.deploy();
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${logicV2.deployTransaction.hash}`
  );
  await logicV2.deployed();
  console.log(
    `New Implementation Logic for Manager: ${chalk.green(logicV2.address)}`
  );

  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await proxyAdmin.upgrade(proxyAddress, logicV2.address, { gasPrice });
  console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
  console.log(
    `${chalk.yellow("Manager")}: ${chalk.green(
      proxyAddress
    )}, Logic: ${chalk.green(logicV2.address)}`
  );

  const mAPTAddress = getDeployedAddress("APYMetaPoolToken", NETWORK_NAME);
  proxy = await ethers.getContractAt("APYManagerV2", proxyAddress);
  gasPrice = await getGasPrice(argv.gasPrice);
  trx = await proxy.setMetaPoolToken(mAPTAddress, { gasPrice });
  console.log("Etherscan:", `https://etherscan.io/tx/${trx.hash}`);
  await trx.wait();
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Manager upgrade successful.");
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
