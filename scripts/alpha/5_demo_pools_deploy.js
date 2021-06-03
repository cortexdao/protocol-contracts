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
  getStablecoinAddress,
  getAggregatorAddress,
  bytes32,
} = require("../../utils/helpers");

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
  console.log("Deploying demo pools ...");
  console.log("");

  let gasUsed = BigNumber.from("0");

  /* deploy logic v2 contract */
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

  const deployData = {
    PoolTokenV2: logicV2.address,
  };
  updateDeployJsons(networkName, deployData);

  /* proxy deploy setup */
  const proxyAdminAddress = getDeployedAddress(
    "PoolTokenProxyAdmin",
    networkName
  );
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    proxyAdminAddress,
    poolDeployer
  );

  // V1 pools all use same logic contract
  const logicAddress = getDeployedAddress("DAI_PoolToken", networkName);

  const PoolTokenProxy = await ethers.getContractFactory(
    "PoolTokenProxy",
    poolDeployer
  );

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const initData = PoolTokenV2.interface.encodeFunctionData(
    "initializeUpgrade(address)",
    [addressRegistryAddress]
  );

  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const underlyerAddress = getStablecoinAddress(symbol, networkName);
    const aggAddress = getAggregatorAddress(`${symbol}-USD`, networkName);
    const proxy = await PoolTokenProxy.deploy(
      logicAddress,
      proxyAdmin.address,
      underlyerAddress,
      aggAddress,
      { gasPrice }
    );
    console.log(
      "Deploy V1:",
      `https://etherscan.io/tx/${proxy.deployTransaction.hash}`
    );
    receipt = await proxy.deployTransaction.wait();
    console.log(`${symbol} Pool proxy: ${chalk.green(proxy.address)}`);
    console.log("  Logic V1:", logicAddress);
    console.log("  Proxy Admin:", proxyAdmin.address);
    console.log("  Underlyer:", underlyerAddress);
    console.log("  Aggregator:", aggAddress);
    console.log("");
    gasUsed = gasUsed.add(receipt.gasUsed);

    gasPrice = await getGasPrice(argv.gasPrice);
    const trx = await proxyAdmin
      .connect(poolDeployer)
      .upgradeAndCall(proxy.address, logicV2.address, initData, { gasPrice });
    console.log("Upgrade to V2:", `https://etherscan.io/tx/${trx.hash}`);
    receipt = await trx.wait();
    console.log("... pool upgraded.");
    console.log("");
    gasUsed = gasUsed.add(receipt.gasUsed);

    deployData[`Demo_${symbol}_PoolTokenProxy`] = proxy.address;
  }
  updateDeployJsons(networkName, deployData);

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
      `Demo_${symbol}_PoolTokenProxy`,
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

  console.log("");
  console.log("Register addresses with Address Registry ...");
  console.log("");
  const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  const addressRegistryDeployer = ethers.Wallet.fromMnemonic(
    ADDRESS_REGISTRY_MNEMONIC
  ).connect(ethers.provider);
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress,
    addressRegistryDeployer
  );

  for (const symbol of ["DAI", "USDC", "USDT"]) {
    gasPrice = await getGasPrice(argv.gasPrice);
    const poolId = bytes32(symbol.toLowerCase() + "DemoPool");
    const poolAddress = getDeployedAddress(
      `Demo_${symbol}_PoolTokenProxy`,
      networkName
    );
    let trx = await addressRegistry.registerAddress(poolId, poolAddress, {
      gasPrice,
    });
    console.log("Register address:", `https://etherscan.io/tx/${trx.hash}`);
    receipt = await trx.wait();
    console.log("");
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
