const { expect } = require("chai");
const { ethers } = require("hardhat");
const { bytes32 } = require("../utils/helpers");
const timeMachine = require("ganache-time-traveler");
const { WHALE_POOLS } = require("../utils/constants");
const {
  acquireToken,
  console,
  tokenAmountToBigNumber,
  deployAggregator,
  generateContractAddress,
} = require("../utils/helpers");

const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TETHER_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const CURVE_3CRV_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const USDC_AGG_ADDRESS = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

async function deployProxy(logic, proxyAdmin, initData) {
  const TransparentUpgradeableProxy = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );
  const proxy = await TransparentUpgradeableProxy.deploy(
    logic.address,
    proxyAdmin.address,
    initData
  );
  await proxy.deployed();
  return proxy;
}

describe("Contract: IndexToken", () => {
  // signers
  let deployer;
  let oracle;
  let adminSafe;
  let emergencySafe;
  let randomUser;

  // Mainnet ERC20s
  let curve3Crv;
  let dai;
  let usdc;
  let tether;

  // protocol contracts
  let tvlAgg;
  let oracleAdapter;
  let mApt;
  let addressRegistry;
  let proxyAdmin;

  // system under test
  let indexToken;
  let depositZap;

  before(async () => {
    [deployer, oracle, adminSafe, emergencySafe, randomUser] =
      await ethers.getSigners();
  });

  // use EVM snapshots for test isolation
  let testSnapshotId;
  let suiteSnapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before("Setup Chainlink Aggregator", async () => {
    const paymentAmount = tokenAmountToBigNumber("1", 18); // LINK
    const maxSubmissionValue = tokenAmountToBigNumber("1", "20");
    const tvlAggConfig = {
      paymentAmount, // payment amount (price paid for each oracle submission, in wei)
      minSubmissionValue: 0,
      maxSubmissionValue,
      decimals: 8, // decimal offset for answer
      description: "TVL aggregator",
    };
    tvlAgg = await deployAggregator(
      tvlAggConfig,
      oracle.address,
      deployer.address, // oracle owner
      deployer.address // ETH funder
    );
  });

  before("Deploy and Setup Address Registry", async () => {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");

    const AddressRegistryV2 = await ethers.getContractFactory(
      "AddressRegistryV2"
    );
    const addressRegistryLogic = await AddressRegistryV2.deploy();
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const encodedParamData = AddressRegistryV2.interface.encodeFunctionData(
      "initialize(address)",
      [proxyAdmin.address]
    );
    const addressRegistryProxy = await deployProxy(
      addressRegistryLogic,
      proxyAdmin,
      encodedParamData
    );
    addressRegistry = await AddressRegistryV2.attach(
      addressRegistryProxy.address
    );

    const erc20AllocationAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(
      bytes32("erc20Allocation"),
      erc20AllocationAddress
    );

    const tvlManagerAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(
      bytes32("tvlManager"),
      tvlManagerAddress
    );

    const lpAccountAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(
      bytes32("lpAccount"),
      lpAccountAddress
    );

    await addressRegistry.registerAddress(
      bytes32("adminSafe"),
      adminSafe.address
    );

    await addressRegistry.registerAddress(
      bytes32("emergencySafe"),
      emergencySafe.address
    );

    const lpSafeAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(bytes32("lpSafe"), lpSafeAddress);
  });

  before("Deploy mAPT", async () => {
    const MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");
    const mAptLogic = await MetaPoolToken.deploy();
    await mAptLogic.deployed();

    const mAptInitData = MetaPoolToken.interface.encodeFunctionData(
      "initialize(address)",
      [addressRegistry.address]
    );
    const mAptProxy = await deployProxy(mAptLogic, proxyAdmin, mAptInitData);
    mApt = await MetaPoolToken.attach(mAptProxy.address);

    await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);
  });

  before("Attack to Mainnet ERC20s", async () => {
    curve3Crv = await ethers.getContractAt(
      "IDetailedERC20",
      CURVE_3CRV_ADDRESS
    );
    dai = await ethers.getContractAt("IDetailedERC20", DAI_ADDRESS);
    usdc = await ethers.getContractAt("IDetailedERC20", USDC_ADDRESS);
    tether = await ethers.getContractAt("IDetailedERC20", TETHER_ADDRESS);
  });

  before("Deploy Oracle Adapter", async () => {
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    oracleAdapter = await OracleAdapter.deploy(
      addressRegistry.address,
      tvlAgg.address,
      [CURVE_3CRV_ADDRESS],
      [USDC_AGG_ADDRESS],
      86400,
      86400
    );
    await oracleAdapter.deployed();
    await addressRegistry.registerAddress(
      bytes32("oracleAdapter"),
      oracleAdapter.address
    );
  });

  before("Deploy Index Token", async () => {
    const IndexToken = await ethers.getContractFactory("TestIndexToken");
    const logic = await IndexToken.deploy();
    await logic.deployed();

    const initData = IndexToken.interface.encodeFunctionData(
      "initialize(address,address)",
      [addressRegistry.address, curve3Crv.address]
    );
    const proxy = await deployProxy(logic, proxyAdmin, initData);
    indexToken = await IndexToken.attach(proxy.address);
  });

  before("Deploy Deposit Zap", async () => {
    const DepositZap = await ethers.getContractFactory("DepositZap");
    depositZap = await DepositZap.deploy(indexToken.address);
    await depositZap.deployed();
  });

  describe.only("deposit", () => {
    it("can deposit DAI", async () => {
      expect(await indexToken.balanceOf(randomUser.address)).to.equal(0);

      await acquireToken(
        WHALE_POOLS["DAI"],
        randomUser.address,
        dai,
        "1000000",
        randomUser.address
      );

      const depositAmount = tokenAmountToBigNumber(1000, 18);
      const index = 0; // DAI

      await dai.connect(randomUser).approve(depositZap.address, depositAmount);
      await depositZap.connect(randomUser).deposit(depositAmount, index);

      expect(await indexToken.balanceOf(randomUser.address)).to.gt(0);
    });

    it("can deposit USDC", async () => {
      expect(await indexToken.balanceOf(randomUser.address)).to.equal(0);

      await acquireToken(
        WHALE_POOLS["USDC"],
        randomUser.address,
        usdc,
        "1000000",
        randomUser.address
      );

      const depositAmount = tokenAmountToBigNumber(1000, 6);
      const index = 1; // USDC

      await usdc.connect(randomUser).approve(depositZap.address, depositAmount);
      await depositZap.connect(randomUser).deposit(depositAmount, index);

      expect(await indexToken.balanceOf(randomUser.address)).to.gt(0);
    });

    it("can deposit Tether", async () => {
      expect(await indexToken.balanceOf(randomUser.address)).to.equal(0);

      await acquireToken(
        WHALE_POOLS["USDT"],
        randomUser.address,
        tether,
        "1000000",
        randomUser.address
      );

      const depositAmount = tokenAmountToBigNumber(1000, 6);
      const index = 2; // Tether

      await tether
        .connect(randomUser)
        .approve(depositZap.address, depositAmount);
      await depositZap.connect(randomUser).deposit(depositAmount, index);

      expect(await indexToken.balanceOf(randomUser.address)).to.gt(0);
    });
  });

  describe.only("redeem", () => {
    before("Deposit for index tokens", async () => {
      const depositAmount = tokenAmountToBigNumber(1000, 6);
      const index = 1; // USDC

      await acquireToken(
        WHALE_POOLS["USDC"],
        deployer.address,
        usdc,
        depositAmount,
        deployer.address
      );

      await usdc.connect(deployer).approve(depositZap.address, depositAmount);
      await depositZap.connect(deployer).deposit(depositAmount, index);

      const indexBalance = await indexToken.balanceOf(deployer.address);
      await indexToken
        .connect(deployer)
        .transfer(randomUser.address, indexBalance);
    });

    it("can withdraw in USDC", async () => {
      const index = 1;
      const indexBalance = await indexToken.balanceOf(randomUser.address);

      await indexToken
        .connect(randomUser)
        .approve(depositZap.address, indexBalance);
      await depositZap.connect(randomUser).redeem(indexBalance, index);
    });
  });
});
