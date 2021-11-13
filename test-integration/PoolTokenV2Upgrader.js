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
  ZERO_ADDRESS,
  getAggregatorAddress,
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

    describe("Logic contract safeguards", () => {
      let poolTokenV2Logic;

      before("deploy", async () => {
        const logicV2Address = await upgrader.callStatic.deployV2Logic();
        await upgrader.deployV2Logic();

        poolTokenV2Logic = await ethers.getContractAt(
          "PoolTokenV2",
          logicV2Address
        );
      });

      // See comment on next test;
      // essentially there is no longer a need to do this, but
      // we continue initializing the logic separately as a matter
      // of best practice.
      it("should call initialize directly on logic contract", async () => {
        await expect(
          poolTokenV2Logic.initialize(FAKE_ADDRESS, FAKE_ADDRESS, FAKE_ADDRESS)
        ).to.be.revertedWith("Contract instance has already been initialized");
      });

      // Normally `initialize` would be responsible for ownership/access
      // control of the contract, but in PoolTokenV2, now that all happens
      // in `initializeUpgrade`; `initialize` has been stripped of any
      // controls setting.  Thus to protect the contract, it suffices to
      // check that nobody can call `initializeUpgrade`.
      it("should revert on `initializeUpgrade`", async () => {
        // EIP-1967 slot for proxy admin won't be set on logic contract
        expect(await poolTokenV2Logic.proxyAdmin()).to.equal(ZERO_ADDRESS);

        // nobody should be able to call this
        await expect(
          poolTokenV2Logic.initializeUpgrade(addressRegistry.address)
        ).to.be.revertedWith("PROXY_ADMIN_ONLY");
      });
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
      await expect(
        upgrader.connect(randomUser).upgrade(FAKE_ADDRESS)
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
      await expect(upgrader.upgrade(FAKE_ADDRESS)).to.be.revertedWith(
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
      await expect(upgrader.upgrade(FAKE_ADDRESS)).to.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );

      // enable upgrader as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(upgrader.address);

      await expect(upgrader.upgradeDaiPool()).to.not.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );
      await expect(upgrader.upgradeUsdcPool()).to.not.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );
      await expect(upgrader.upgradeUsdtPool()).to.not.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
      );
      await expect(upgrader.upgrade(FAKE_ADDRESS)).to.not.be.revertedWith(
        "ENABLE_AS_EMERGENCY_MODULE"
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
      await expect(upgrader.upgrade(USDC_POOL_PROXY)).to.be.revertedWith(
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

    // this test is more like a sanity check
    it("Can upgrade freshly deployed V1 pool", async () => {
      const PoolToken = await ethers.getContractFactory("PoolToken");
      const logic = await PoolToken.deploy();
      const TransparentUpgradeableProxy = await ethers.getContractFactory(
        "TransparentUpgradeableProxy"
      );
      const USDC_TOKEN = getStablecoinAddress("USDC", "MAINNET");
      const USDC_ETH_AGG = getAggregatorAddress("USDC-ETH", "MAINNET");
      const initData = PoolToken.interface.encodeFunctionData(
        "initialize(address,address,address)",
        [POOL_PROXY_ADMIN, USDC_TOKEN, USDC_ETH_AGG]
      );
      const proxy = await TransparentUpgradeableProxy.deploy(
        logic.address,
        POOL_PROXY_ADMIN,
        initData
      );

      // enable upgrader as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(upgrader.address);

      // fund upgrader with stables
      const usdcToken = await ethers.getContractAt(
        "IDetailedERC20",
        getStablecoinAddress("USDC", "MAINNET")
      );
      const decimals = await usdcToken.decimals();
      await acquireToken(
        WHALE_POOLS["USDC"],
        upgrader.address,
        usdcToken,
        tokenAmountToBigNumber("271.828182", decimals),
        deployer.address
      );

      await expect(upgrader.upgrade(proxy.address)).to.not.be.reverted;

      const v2Pool = await ethers.getContractAt("PoolTokenV2", proxy.address);
      expect(await v2Pool.addLiquidityLock()).to.be.true;
      expect(await v2Pool.feePercentage()).to.be.gt(0);
    });

    it("Can upgrade demo pools deployed by AlphaDeployment", async () => {
      /**********************/
      /*  Deploy demo pools */
      /**********************/

      // deploy alphaDeployment contract
      const ProxyFactory = await ethers.getContractFactory("ProxyFactory");
      const proxyFactory = await ProxyFactory.deploy();
      const PoolTokenV1Factory = await ethers.getContractFactory(
        "PoolTokenV1Factory"
      );
      const poolTokenV1Factory = await PoolTokenV1Factory.deploy();
      const AlphaDeployment = await ethers.getContractFactory(
        "TestAlphaDeployment"
      );
      const MOCK_CONTRACT_ADDRESS = (await deployMockContract(deployer, []))
        .address;
      const alphaDeployment = await AlphaDeployment.deploy(
        proxyFactory.address, // proxy factory
        MOCK_CONTRACT_ADDRESS, // address registry v2 factory
        MOCK_CONTRACT_ADDRESS, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        MOCK_CONTRACT_ADDRESS, // pool token v2 factory
        MOCK_CONTRACT_ADDRESS, // tvl manager factory
        MOCK_CONTRACT_ADDRESS, // erc20 allocation factory
        MOCK_CONTRACT_ADDRESS, // oracle adapter factory
        MOCK_CONTRACT_ADDRESS // lp account factory
      );

      // enable alphDeployment as module
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(alphaDeployment.address);
      // setup to pass step checks
      await alphaDeployment.testSetStep(5);
      const mAptAddress = await addressRegistry.mAptAddress();
      await alphaDeployment.testSetMapt(mAptAddress);

      await alphaDeployment.deploy_5_DemoPools();

      /*****************************/
      /* End demo pools deployment */
      /*****************************/

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

      const daiDemoPoolAddress = await alphaDeployment.daiDemoPool();
      await upgrader.upgrade(daiDemoPoolAddress);

      let v2Pool = await ethers.getContractAt(
        "PoolTokenV2",
        daiDemoPoolAddress
      );
      expect(await v2Pool.addLiquidityLock()).to.be.true;
      expect(await v2Pool.feePercentage()).to.be.gt(0);

      const usdcDemoPoolAddress = await alphaDeployment.usdcDemoPool();
      await upgrader.upgrade(usdcDemoPoolAddress);

      v2Pool = await ethers.getContractAt("PoolTokenV2", usdcDemoPoolAddress);
      expect(await v2Pool.addLiquidityLock()).to.be.true;
      expect(await v2Pool.feePercentage()).to.be.gt(0);

      const usdtDemoPoolAddress = await alphaDeployment.usdtDemoPool();
      await upgrader.upgrade(usdtDemoPoolAddress);

      v2Pool = await ethers.getContractAt("PoolTokenV2", usdtDemoPoolAddress);
      expect(await v2Pool.addLiquidityLock()).to.be.true;
      expect(await v2Pool.feePercentage()).to.be.gt(0);
    });
  });
});
