const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const {
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
  getDeployedAddress,
  getStablecoinAddress,
  acquireToken,
  FAKE_ADDRESS,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");
const timeMachine = require("ganache-time-traveler");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

const ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";
const POOL_PROXY_ADMIN = "0x7965283631253DfCb71Db63a60C656DEDF76234f";
const DAI_POOL_PROXY = "0x75ce0e501e2e6776fcaaa514f394a88a772a8970";
const USDC_POOL_PROXY = "0xe18b0365d5d09f394f84ee56ed29dd2d8d6fba5f";
const USDT_POOL_PROXY = "0xea9c5a2717d5ab75afaac340151e73a7e37d99a7";

describe("Contract: PoolTokenV2Upgrader", () => {
  // signers
  let deployer;
  let randomUser;
  let emergencySafeSigner;

  // contract factories
  let PoolTokenV2Upgrader;

  // deployed factories
  let poolTokenV2Factory;

  // deployed contracts
  let upgrader;

  // Mainnet contracts
  let emergencySafe;
  let addressRegistry;

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

  before("Get signers", async () => {
    [deployer, randomUser] = await ethers.getSigners();

    const emergencySafeAddress = getDeployedAddress("EmergencySafe", "MAINNET");
    emergencySafeSigner = await impersonateAccount(emergencySafeAddress);
    await forciblySendEth(
      emergencySafeSigner.address,
      tokenAmountToBigNumber(5),
      deployer.address
    );
  });

  before("Attach to Mainnet Safes", async () => {
    // Only the Emergency Safe is needed for the pool v2 upgrades.
    // It owns the pool proxy admin and the address registry and its
    // proxy admin.
    emergencySafe = await ethers.getContractAt(
      "IGnosisModuleManager",
      emergencySafeSigner.address
    );
  });

  before("Upgrade Mainnet Address Registry to V2", async () => {
    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      ADDRESS_REGISTRY,
      emergencySafeSigner
    );

    // Even though Address Registry is upgraded to V2 on Mainnet,
    // it's best to upgrade again here, just in case there are any
    // updates made before final alpha deployment.
    const AddressRegistryV2 = await ethers.getContractFactory(
      "AddressRegistryV2"
    );
    const logic = await AddressRegistryV2.deploy();
    const proxyAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      POOL_PROXY_ADMIN,
      emergencySafeSigner
    );
    await proxyAdmin.upgrade(addressRegistry.address, logic.address);
  });

  before("Deploy factories", async () => {
    const PoolTokenV2Factory = await ethers.getContractFactory(
      "PoolTokenV2Factory"
    );
    poolTokenV2Factory = await PoolTokenV2Factory.deploy();

    PoolTokenV2Upgrader = await ethers.getContractFactory(
      "PoolTokenV2Upgrader"
    );
  });

  before("Deploy upgrader", async () => {
    // in production, deploy will be via the Admin Safe
    upgrader = await PoolTokenV2Upgrader.connect(emergencySafeSigner).deploy(
      poolTokenV2Factory.address
    );
  });

  before("Mock any needed dependencies", async () => {
    // In addition to satisfying the initializer for PoolTokenV2,
    // which requires an mAPT address for contract role, `redeem`
    // in V2 requires mAPT to provide a deployed value.
    const mApt = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("MetaPoolToken").abi
    );
    await mApt.mock.getDeployedValue.returns(0);

    await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);

    // `redeem` in V2 also hits the Oracle Adapter for underlyer price
    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapter").abi
    );
    await oracleAdapter.mock.getAssetPrice.returns(
      tokenAmountToBigNumber(1, 8)
    );

    await addressRegistry.registerAddress(
      bytes32("oracleAdapter"),
      oracleAdapter.address
    );
  });

  describe("Defaults", () => {
    it("Owner is deployer", async () => {
      expect(await upgrader.owner()).to.equal(emergencySafeSigner.address);
    });

    it("Address Registry is set", async () => {
      expect(await upgrader.addressRegistry()).to.equal(ADDRESS_REGISTRY);
    });
  });

  describe("setPoolTokenV2Factory", () => {
    it("Owner can call", async () => {
      const contract = await deployMockContract(deployer, []);
      await expect(
        upgrader
          .connect(emergencySafeSigner)
          .setPoolTokenV2Factory(contract.address)
      ).to.not.be.reverted;
    });

    it("Revert when non-owner attempts call", async () => {
      const contract = await deployMockContract(deployer, []);
      await expect(
        upgrader.connect(randomUser).setPoolTokenV2Factory(contract.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("deployV2Logic", () => {
    it("Owner can call", async () => {
      await expect(upgrader.connect(emergencySafeSigner).deployV2Logic()).to.not
        .be.reverted;
    });

    it("Revert when non-owner attempts call", async () => {
      await expect(
        upgrader.connect(randomUser).deployV2Logic()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Upgrade", () => {
    it("Revert when non-owner attempts call", async () => {
      await expect(
        upgrader.connect(randomUser).upgradeAll()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        upgrader.connect(randomUser).upgradeDaiPool()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        upgrader.connect(randomUser).upgradeUsdcPool()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        upgrader.connect(randomUser).upgradeUsdtPool()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Revert if Safe address changes", async () => {
      await addressRegistry.registerAddress(
        bytes32("emergencySafe"),
        FAKE_ADDRESS
      );

      await expect(upgrader.upgradeDaiPool()).to.be.revertedWith(
        "INVALID_EMERGENCY_SAFE"
      );
      await expect(upgrader.upgradeUsdcPool()).to.be.revertedWith(
        "INVALID_EMERGENCY_SAFE"
      );
      await expect(upgrader.upgradeUsdtPool()).to.be.revertedWith(
        "INVALID_EMERGENCY_SAFE"
      );
    });

    it("Revert if upgrader is not enabled module", async () => {
      await expect(upgrader.upgradeDaiPool()).to.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );
      await expect(upgrader.upgradeUsdcPool()).to.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );
      await expect(upgrader.upgradeUsdtPool()).to.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );

      // enable upgrader as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(upgrader.address);

      await expect(upgrader.upgradeDaiPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
      await expect(upgrader.upgradeUsdcPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
      await expect(upgrader.upgradeUsdtPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
    });

    it("Revert if upgrader isn't funded with stable", async () => {
      // enable upgrader as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(upgrader.address);

      await expect(upgrader.upgradeDaiPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
      await expect(upgrader.upgradeUsdcPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
      await expect(upgrader.upgradeUsdtPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
    });

    it("Can upgrade", async () => {
      // enable upgrader as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(upgrader.address);

      // fund upgrader with stables
      for (const symbol of ["DAI", "USDC", "USDT"]) {
        const token = await ethers.getContractAt(
          "IDetailedERC20",
          getStablecoinAddress(symbol, "MAINNET")
        );
        const decimals = await token.decimals();
        await acquireToken(
          WHALE_POOLS[symbol],
          upgrader.address,
          token,
          tokenAmountToBigNumber("271.828182", decimals),
          deployer.address
        );
      }

      await expect(upgrader.upgradeAll()).to.not.be.reverted;

      const daiPool = await ethers.getContractAt("PoolTokenV2", DAI_POOL_PROXY);
      expect(await daiPool.addLiquidityLock()).to.be.true;
      expect(await daiPool.feePercentage()).to.be.gt(0);

      const usdcPool = await ethers.getContractAt(
        "PoolTokenV2",
        USDC_POOL_PROXY
      );
      expect(await usdcPool.addLiquidityLock()).to.be.true;
      expect(await usdcPool.feePercentage()).to.be.gt(0);

      const usdtPool = await ethers.getContractAt(
        "PoolTokenV2",
        USDT_POOL_PROXY
      );
      expect(await usdtPool.addLiquidityLock()).to.be.true;
      expect(await usdtPool.feePercentage()).to.be.gt(0);
    });

    it("Revert if balances mapping has wrong slot", async () => {
      // enable upgrader as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(upgrader.address);

      // fund upgrader with stables
      for (const symbol of ["DAI", "USDC", "USDT"]) {
        const token = await ethers.getContractAt(
          "IDetailedERC20",
          getStablecoinAddress(symbol, "MAINNET")
        );
        const decimals = await token.decimals();
        await acquireToken(
          WHALE_POOLS[symbol],
          upgrader.address,
          token,
          tokenAmountToBigNumber("271.828182", decimals),
          deployer.address
        );
      }

      const BrokenPoolTokenV2Factory = await ethers.getContractFactory(
        "TestBrokenPoolTokenV2Factory"
      );
      const brokenPoolTokenV2Factory = await BrokenPoolTokenV2Factory.deploy();
      await upgrader.setPoolTokenV2Factory(brokenPoolTokenV2Factory.address);

      await expect(upgrader.upgradeAll()).to.be.revertedWith(
        "BALANCEOF_TEST_FAILED"
      );
    });
  });
});
