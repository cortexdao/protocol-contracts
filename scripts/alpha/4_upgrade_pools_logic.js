const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses EthGasStation value",
});
const hre = require("hardhat");
const { ethers, network } = hre;
const chalk = require("chalk");
const {
  getGasPrice,
  getDeployedAddress,
  updateDeployJsons,
} = require("../../utils/helpers");

async function main() {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${chalk.green(deployer.address)}`);

  const poolAdminAddress = getDeployedAddress(
    "APYPoolTokenProxyAdmin",
    NETWORK_NAME
  );
  const proxyAdmin = await ethers.getContractAt(
    "APYPoolTokenProxyAdmin",
    poolAdminAddress
  );
  const mAPTAddress = getDeployedAddress("APYMetaPoolToken", NETWORK_NAME);
  const mApt = await ethers.getContractAt("APYMetaPoolToken", mAPTAddress);

  const APYPoolTokenV2 = await ethers.getContractFactory("APYPoolTokenV2");
  let gasPrice = await getGasPrice(argv.gasPrice);
  const logicV2 = await APYPoolTokenV2.deploy({ gasPrice });
  await logicV2.deployed();

  console.log(
    `New Implementation Logic for Pools: ${chalk.green(logicV2.address)}`
  );
  console.log(
    "Etherscan:",
    `https://etherscan.io/tx/${logicV2.deployTransaction.hash}`
  );

  const initData = APYPoolTokenV2.interface.encodeFunctionData(
    "initializeUpgrade(address)",
    [mApt.address]
  );

  const deployData = {};
  for (const symbol of ["DAI", "USDC", "USDC"]) {
    const poolAddress = getDeployedAddress(
      symbol + "_APYPoolTokenProxy",
      NETWORK_NAME
    );
    gasPrice = await getGasPrice(argv.gasPrice);
    await proxyAdmin
      .connect(deployer)
      .upgradeAndCall(poolAddress, logicV2.address, initData, { gasPrice });
    deployData[symbol + "_APYPoolToken"] = logicV2.address;
    console.log(
      `${chalk.yellow(symbol)} Pool: ${chalk.green(
        poolAddress
      )}, Logic: ${chalk.green(logicV2.address)}`
    );
    console.log("");
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
