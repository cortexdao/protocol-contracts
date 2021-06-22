#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.  Values are passed like so:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js --arg1=val1 --arg2=val2
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ MNEMONIC='' yarn fork:mainnet
 */
const { argv } = require("yargs");
const hre = require("hardhat");
const { ethers, network } = hre;
const assert = require("assert");
const {
  ZERO_ADDRESS,
  tokenAmountToBigNumber,
  acquireToken,
  getDeployedAddress,
  bytes32,
  impersonateAccount,
  getAggregatorAddress,
  getStablecoinAddress,
} = require("../../utils/helpers");
const { console } = require("./utils");

const NODE_ADDRESS = "0xAD702b65733aC8BcBA2be6d9Da94d5b7CE25C0bb";
const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
// Aave lending pool
// https://etherscan.io/address/0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3
const WHALE_ADDRESS = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3";

async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");
  assert.strictEqual(
    networkName,
    "LOCALHOST",
    "This script is for local forked mainnet testing only."
  );

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  console.log("Deployer nonce:", nonce);
  console.log("");
  assert.strictEqual(
    nonce,
    0,
    "Nonce must be zero as we rely on deterministic contract addresses."
  );

  console.log("Deploying FluxAggregator ...");

  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");

  const paymentAmount = tokenAmountToBigNumber("1", "18");

  const aggregator = await FluxAggregator.deploy(
    LINK_ADDRESS,
    paymentAmount, // payment amount (price paid for each oracle submission, in wei)
    100000, // timeout before allowing oracle to skip round
    ZERO_ADDRESS, // validator address
    0, // min submission value
    tokenAmountToBigNumber(1, "20"), // max submission value
    8, // decimal offset for answer
    "TVL aggregator" // description
  );
  await aggregator.deployed();
  // console.log(`Chainlink node: ${chalk.green(NODE_ADDRESS)}`);
  console.logAddress("Chainlink node", NODE_ADDRESS);
  console.logAddress("LINK token", LINK_ADDRESS);
  console.logAddress("FluxAggregator", aggregator.address);
  console.logDone();

  console.log("Funding aggregator with LINK ...");
  const token = await ethers.getContractAt("IDetailedERC20", LINK_ADDRESS);
  // aggregator must hold enough LINK for two rounds of submissions, i.e.
  // LINK reserve >= 2 * number of oracles * payment amount
  const linkAmount = argv.linkAmount || "100000";
  await acquireToken(
    WHALE_ADDRESS,
    aggregator.address,
    token,
    linkAmount,
    deployer.address
  );
  let trx = await aggregator.updateAvailableFunds();
  await trx.wait();
  console.logDone();

  console.log("Registering oracle node ...");
  trx = await aggregator.changeOracles(
    [], // oracles being removed
    [NODE_ADDRESS], // oracles being added
    [deployer.address], // owners of oracles being added
    1, // min number of submissions for a round
    1, // max number of submissions for a round
    0 // number of rounds to wait before oracle can initiate round
  );
  await trx.wait();
  console.logDone();

  console.log("Funding oracle node with ETH ...");
  const ethAmount = tokenAmountToBigNumber(argv.ethAmount || "100");
  trx = await deployer.sendTransaction({
    to: NODE_ADDRESS,
    value: ethAmount,
  });
  await trx.wait();
  console.logDone();

  console.log("Upgrading AddressRegistry ...");
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  let addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress
  );
  const addressRegistryDeployer = await impersonateAccount(
    await addressRegistry.owner()
  );
  trx = await deployer.sendTransaction({
    to: addressRegistryDeployer.address,
    value: ethers.utils.parseEther("1.0"),
  });
  await trx.wait();

  const addressRegistryAdminAddress = getDeployedAddress(
    "AddressRegistryProxyAdmin",
    networkName
  );
  let addressRegistryAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    addressRegistryAdminAddress
  );
  const addressRegistryAdminDeployer = await impersonateAccount(
    await addressRegistryAdmin.owner()
  );
  addressRegistryAdmin = addressRegistryAdmin.connect(
    addressRegistryAdminDeployer
  );

  const AddressRegistryV2 = await ethers.getContractFactory(
    "AddressRegistryV2",
    addressRegistryDeployer
  );
  const addressRegistryLogic = await AddressRegistryV2.deploy();
  await addressRegistryLogic.deployed();
  const addressRegistryProxyAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  trx = await addressRegistryAdmin.upgrade(
    addressRegistryProxyAddress,
    addressRegistryLogic.address
  );
  await trx.wait();
  addressRegistry = AddressRegistryV2.attach(
    addressRegistryProxyAddress,
    addressRegistryDeployer
  );
  await addressRegistry.deleteAddress(bytes32("manager"));
  await addressRegistry.deleteAddress(bytes32("chainlinkRegistry"));
  console.logDone();

  // Note: in prod deployment, separate admins are deployed for contracts
  console.log("Deploying ProxyAdmin ...");
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  console.logAddress("ProxyAdmin", proxyAdmin.address);
  console.logDone();

  console.log("");
  console.log("Deploying MetaPoolToken ...");

  const MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");
  const MetaPoolTokenProxy = await ethers.getContractFactory(
    "MetaPoolTokenProxy"
  );

  const mAptLogic = await MetaPoolToken.deploy();
  await mAptLogic.deployed();

  let mApt = await MetaPoolTokenProxy.deploy(
    mAptLogic.address,
    proxyAdmin.address,
    addressRegistry.address
  );
  await mApt.deployed();
  mApt = await MetaPoolToken.attach(mApt.address); // attach logic interface
  console.logAddress("MetaPoolToken", mApt.address);
  trx = await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);
  console.log("Registered mAPT with Address Registry.");
  console.logDone();
  console.logDone();

  console.log("");
  console.log("Deploying OracleAdapter ...");

  const aggStalePeriod = 86400;
  const defaultLockPeriod = 270;

  const symbols = ["DAI", "USDC", "USDT"];
  const assets = symbols.map((symbol) =>
    getStablecoinAddress(symbol, networkName)
  );
  const sources = symbols.map((symbol) =>
    getAggregatorAddress(`${symbol}-USD`, networkName)
  );
  console.log(aggregator.address);

  const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
  const oracleAdapter = await OracleAdapter.deploy(
    addressRegistry.address,
    aggregator.address,
    assets,
    sources,
    aggStalePeriod,
    defaultLockPeriod
  );
  await oracleAdapter.deployed();
  console.logAddress("OracleAdapter", oracleAdapter.address);
  trx = await addressRegistry.registerAddress(
    bytes32("oracleAdapter"),
    oracleAdapter.address
  );
  console.log("Registered Oracle Adapter with Address Registry.");
  console.logDone();

  console.log("Deploying Pool Manager ...");

  const PoolManager = await ethers.getContractFactory("PoolManager");
  const PoolManagerProxy = await ethers.getContractFactory("PoolManagerProxy");

  const poolManagerLogic = await PoolManager.deploy();
  await poolManagerLogic.deployed();

  let poolManager = await PoolManagerProxy.deploy(
    poolManagerLogic.address,
    proxyAdmin.address,
    addressRegistryAddress
  );
  await poolManager.deployed();
  poolManager = PoolManager.attach(poolManager.address); // attach logic interface
  console.logAddress("PoolManager", poolManager.address);
  trx = await addressRegistry.registerAddress(
    bytes32("poolManager"),
    poolManager.address
  );
  console.log("Registered Pool Manager with Address Registry.");
  console.logDone();

  console.log("Deploying TVL Manager ...");

  const TvlManager = await ethers.getContractFactory("TvlManager");

  const tvlManager = await TvlManager.deploy(addressRegistry.address);
  await tvlManager.deployed();
  console.logAddress("TvlManager", tvlManager.address);
  trx = await addressRegistry.registerAddress(
    bytes32("tvlManager"),
    tvlManager.address
  );
  await trx.wait();
  console.log("Registered TVL Manager with Address Registry.");
  console.logDone();

  console.log("Upgrading pools ...");

  const poolAdminAddress = getDeployedAddress(
    "PoolTokenProxyAdmin",
    networkName
  );
  const poolAdmin = await ethers.getContractAt("ProxyAdmin", poolAdminAddress);
  const poolDeployer = await impersonateAccount(await poolAdmin.owner());

  const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
  const poolLogicV2 = await PoolTokenV2.deploy();
  await poolLogicV2.deployed();

  let initData = PoolTokenV2.interface.encodeFunctionData(
    "initializeUpgrade(address)",
    [addressRegistry.address]
  );

  for (const symbol of ["DAI", "USDC", "USDT"]) {
    console.log(`- ${symbol}:`);
    const poolAddress = getDeployedAddress(
      symbol + "_PoolTokenProxy",
      networkName
    );

    let trx = await poolAdmin
      .connect(poolDeployer)
      .upgradeAndCall(poolAddress, poolLogicV2.address, initData);
    await trx.wait();
    console.log("  Pool upgraded.");

    const pool = await ethers.getContractAt(
      "PoolTokenV2",
      poolAddress,
      poolDeployer
    );
    trx = await pool.infiniteApprove(poolManager.address);
    console.log("  Approve pool manager.");
    await trx.wait();
  }
  console.logDone();

  console.log("Deploying periphery contracts ...");
  console.log("");
  console.log("Aave lending pool");
  console.log("");
  const AavePeriphery = await ethers.getContractFactory("AavePeriphery");
  const aave = await AavePeriphery.deploy();
  await aave.deployed();
  console.logAddress("Aave periphery:", aave.address);
  trx = await addressRegistry.registerAddress(
    bytes32("aavePeriphery"),
    aave.address
  );
  await trx.wait();

  console.log("");
  console.log("Uniswap");
  console.log("");
  const UniswapPeriphery = await ethers.getContractFactory("UniswapPeriphery");
  const uniswap = await UniswapPeriphery.deploy();
  await uniswap.deployed();
  console.logAddress("Uniswap periphery:", aave.address);
  trx = await addressRegistry.registerAddress(
    bytes32("uniswapPeriphery"),
    uniswap.address
  );
  await trx.wait();

  console.log("");
  console.log("Curve 3pool");
  console.log("");
  const CurvePeriphery = await ethers.getContractFactory("CurvePeriphery");
  const curve = await CurvePeriphery.deploy();
  await curve.deployed();
  console.logAddress("Curve periphery:", aave.address);
  trx = await addressRegistry.registerAddress(
    bytes32("curvePeriphery"),
    curve.address
  );
  await trx.wait();
  console.logDone();
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
