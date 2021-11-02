const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const {
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
  getDeployedAddress,
  FAKE_ADDRESS,
  ZERO_ADDRESS,
  getLogicContract,
  getProxyAdmin,
} = require("../utils/helpers");
const {
  AGG_MAP: { MAINNET: AGGS },
} = require("../utils/constants");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";
const MAINNET_POOL_PROXY_ADMIN = "0x7965283631253DfCb71Db63a60C656DEDF76234f";

describe("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
  let emergencySafe;
  let adminSafe;

  // contract factories
  let AlphaDeployment;

  // deployed factories
  let proxyAdminFactory;
  let proxyFactory;
  let addressRegistryV2Factory;
  let metaPoolTokenFactory;
  let poolTokenV1Factory;
  let poolTokenV2Factory;
  let tvlManagerFactory;
  let erc20AllocationFactory;
  let oracleAdapterFactory;
  let lpAccountFactory;

  let alphaDeployment;
  let addressRegistry;

  before("Attach to Mainnet Address Registry", async () => {
    [deployer] = await ethers.getSigners();

    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      MAINNET_ADDRESS_REGISTRY
    );
  });

  before("Attach to Safes", async () => {
    const emergencySafeAddress = getDeployedAddress("EmergencySafe", "MAINNET");
    emergencySafe = await ethers.getContractAt(
      "IGnosisModuleManager",
      emergencySafeAddress
    );
    const adminSafeAddress = getDeployedAddress("AdminSafe", "MAINNET");
    adminSafe = await ethers.getContractAt(
      "IGnosisModuleManager",
      adminSafeAddress
    );
  });

  before("Deploy factories and mock deployed addresses", async () => {
    const ProxyAdminFactory = await ethers.getContractFactory(
      "ProxyAdminFactory"
    );
    proxyAdminFactory = await ProxyAdminFactory.deploy();

    const ProxyFactory = await ethers.getContractFactory("ProxyFactory");
    proxyFactory = await ProxyFactory.deploy();

    const AddressRegistryV2Factory = await ethers.getContractFactory(
      "AddressRegistryV2Factory"
    );
    addressRegistryV2Factory = await AddressRegistryV2Factory.deploy();

    const MetaPoolTokenFactory = await ethers.getContractFactory(
      "MetaPoolTokenFactory"
    );
    metaPoolTokenFactory = await MetaPoolTokenFactory.deploy();

    const PoolTokenV1Factory = await ethers.getContractFactory(
      "PoolTokenV1Factory"
    );
    poolTokenV1Factory = await PoolTokenV1Factory.deploy();

    const PoolTokenV2Factory = await ethers.getContractFactory(
      "PoolTokenV2Factory"
    );
    poolTokenV2Factory = await PoolTokenV2Factory.deploy();

    const TvlManagerFactory = await ethers.getContractFactory(
      "TvlManagerFactory"
    );
    tvlManagerFactory = await TvlManagerFactory.deploy();

    const Erc20AllocationFactory = await ethers.getContractFactory(
      "Erc20AllocationFactory"
    );
    erc20AllocationFactory = await Erc20AllocationFactory.deploy();

    const OracleAdapterFactory = await ethers.getContractFactory(
      "OracleAdapterFactory"
    );
    oracleAdapterFactory = await OracleAdapterFactory.deploy();

    const LpAccountFactory = await ethers.getContractFactory(
      "LpAccountFactory"
    );
    lpAccountFactory = await LpAccountFactory.deploy();

    AlphaDeployment = await ethers.getContractFactory("AlphaDeployment");
  });

  /*
   * These deployment step tests must be run in the order given.  This means we cannot
   * run these tests in parallel.
   *
   * FIXME: 1. If a step fails, block subsequent steps, e.g. using `mocha-steps`.
   *        2. Find a better way to ensure sequential test ordering.
   */
  it("constructor", async () => {
    alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        proxyFactory.address, // proxy factory
        addressRegistryV2Factory.address, // address registry v2 factory
        metaPoolTokenFactory.address, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        tvlManagerFactory.address, // tvl manager factory
        erc20AllocationFactory.address, // erc20 allocation factory
        oracleAdapterFactory.address, // oracle adapter factory
        lpAccountFactory.address // lp account factory
      )
    ).to.not.be.reverted;
    expect(await alphaDeployment.step()).to.equal(0);
  });

  describe("Deployment steps", () => {
    before("Enable as module for Emergency and Admin Safes", async () => {
      await forciblySendEth(
        emergencySafe.address,
        tokenAmountToBigNumber(10),
        deployer.address
      );

      const emergencySafeSigner = await impersonateAccount(
        emergencySafe.address
      );
      await emergencySafe
        .connect(emergencySafeSigner)
        .enableModule(alphaDeployment.address);

      expect(await emergencySafe.getModules()).to.include(
        alphaDeployment.address
      );

      await forciblySendEth(
        adminSafe.address,
        tokenAmountToBigNumber(10),
        deployer.address
      );

      const adminSafeSigner = await impersonateAccount(adminSafe.address);
      await adminSafe
        .connect(adminSafeSigner)
        .enableModule(alphaDeployment.address);

      expect(await adminSafe.getModules()).to.include(alphaDeployment.address);
    });

    describe("Step 0: Upgrade AddressRegistry", () => {
      it("should update step number", async () => {
        await alphaDeployment.deploy_0_AddressRegistryV2_upgrade();
        expect(await alphaDeployment.step()).to.equal(1);
      });

      it("new addresses should be registered after upgrade", async () => {
        await expect(addressRegistry.emergencySafeAddress()).to.not.be.reverted;
      });

      it("should call initialize directly on logic contract", async () => {
        const logicAddress = await alphaDeployment.addressRegistryV2();
        const logic = await ethers.getContractAt(
          "AddressRegistryV2",
          logicAddress
        );

        await expect(logic.initialize(FAKE_ADDRESS)).to.be.revertedWith(
          "Contract instance has already been initialized"
        );
      });
    });

    describe("Step 1: Deploy mAPT", () => {
      before("Run step 1", async () => {
        await alphaDeployment.deploy_1_MetaPoolToken();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(2);
      });

      it("should register the mAPT address", async () => {
        expect(await addressRegistry.mAptAddress()).to.equal(
          await alphaDeployment.mApt()
        );
      });

      it("should call initialize directly on logic contract", async () => {
        const mAptAddress = await alphaDeployment.mApt();
        const logic = await getLogicContract(mAptAddress, "MetaPoolToken");

        await expect(
          logic.initialize(addressRegistry.address)
        ).to.be.revertedWith("Contract instance has already been initialized");
      });

      it("should use pool proxy admin", async () => {
        const mAptAddress = await alphaDeployment.mApt();
        const proxyAdmin = await getProxyAdmin(mAptAddress);

        expect(proxyAdmin.address).to.equal(MAINNET_POOL_PROXY_ADMIN);
      });
    });

    describe("Step 2: Deploy PoolTokenV2 logic contract", () => {
      before("Run step 2", async () => {
        await alphaDeployment.deploy_2_PoolTokenV2_logic();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(3);
      });

      // See comment on next test;
      // essentially there is no longer a need to do this, but
      // we continue initializing the logic separately as a matter
      // of best practice.
      it("should call initialize directly on logic contract", async () => {
        const poolTokenV2Logic = await ethers.getContractAt(
          "PoolTokenV2",
          await alphaDeployment.poolTokenV2()
        );

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
        const poolTokenV2Logic = await ethers.getContractAt(
          "PoolTokenV2",
          await alphaDeployment.poolTokenV2()
        );

        // EIP-1967 slot for proxy admin won't be set on logic contract
        expect(await poolTokenV2Logic.proxyAdmin()).to.equal(ZERO_ADDRESS);

        // nobody should be able to call this
        await expect(
          poolTokenV2Logic.initializeUpgrade(addressRegistry.address)
        ).to.be.revertedWith("PROXY_ADMIN_ONLY");
      });
    });

    describe("Step 3: Deploy demo pools", async () => {
      const demoPoolAddresses = [
        {
          variable: "daiDemoPool",
          addressId: "daiDemoPool",
        },
        {
          variable: "usdcDemoPool",
          addressId: "usdcDemoPool",
        },
        {
          variable: "usdtDemoPool",
          addressId: "usdtDemoPool",
        },
      ];

      before("Run step 3", async () => {
        await alphaDeployment.deploy_3_DemoPools();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(4);
      });

      demoPoolAddresses.forEach((poolData) => {
        describe(poolData.addressId, async () => {
          let registeredAddress;
          let demoPool;

          before(async () => {
            registeredAddress = await addressRegistry.getAddress(
              bytes32(poolData.addressId)
            );
            demoPool = await ethers.getContractAt(
              "PoolTokenV2",
              await alphaDeployment[poolData.variable]()
            );
          });

          it("should register the pool with the address registry", async () => {
            expect(registeredAddress).to.equal(demoPool.address);
          });

          it("should use pool proxy admin", async () => {
            const proxyAdmin = await getProxyAdmin(demoPool.address);
            expect(proxyAdmin.address).to.equal(MAINNET_POOL_PROXY_ADMIN);
          });

          it("should have v2 pool functions and v2 variables initialized", async () => {
            expect(await demoPool.reservePercentage()).to.equal(5);
          });
        });
      });
    });

    describe("Step 4: Deploy TvlManager", () => {
      before("Run step 4", async () => {
        await alphaDeployment.deploy_4_TvlManager();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(5);
      });

      it("should register the TvlManager address", async () => {
        expect(await addressRegistry.tvlManagerAddress()).to.equal(
          await alphaDeployment.tvlManager()
        );
      });
    });

    describe("Step 5: Deploy LpAccount", () => {
      let lpAccountAddress;

      before("Run step 5", async () => {
        await alphaDeployment.deploy_5_LpAccount();
        lpAccountAddress = await alphaDeployment.lpAccount();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(6);
      });

      it("should register the LpAccount address", async () => {
        expect(await addressRegistry.lpAccountAddress()).to.equal(
          lpAccountAddress
        );
      });

      it("should use pool proxy admin", async () => {
        const proxyAdmin = await getProxyAdmin(lpAccountAddress);
        expect(proxyAdmin.address).to.equal(MAINNET_POOL_PROXY_ADMIN);
      });

      it("should call initialize directly on logic contract", async () => {
        const logic = await getLogicContract(lpAccountAddress, "LpAccount");

        await expect(
          logic.initialize(addressRegistry.address)
        ).to.be.revertedWith("Contract instance has already been initialized");
      });
    });

    describe("Step 6: Deploy OracleAdapter", () => {
      let oracleAdapterAddress;
      let oracleAdapter;
      const priceAggs = [
        {
          symbol: "DAI",
          token: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
          agg: AGGS["DAI-USD"],
        },
        {
          symbol: "USDC",
          token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          agg: AGGS["USDC-USD"],
        },
        {
          symbol: "USDT",
          token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
          agg: AGGS["USDT-USD"],
        },
      ];

      before("Run step 6", async () => {
        await alphaDeployment.deploy_6_OracleAdapter();
        oracleAdapterAddress = await alphaDeployment.oracleAdapter();
        oracleAdapter = await ethers.getContractAt(
          "OracleAdapter",
          oracleAdapterAddress
        );
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(7);
      });

      it("should register the OracleAdapter address", async () => {
        expect(await addressRegistry.oracleAdapterAddress()).to.equal(
          oracleAdapterAddress
        );
      });

      it("should set the TVL aggregator", async () => {
        expect(await oracleAdapter.tvlSource()).to.equal(AGGS["TVL"]);
      });

      priceAggs.forEach((priceAgg) => {
        it(`should set the ${priceAgg.symbol} price aggregator`, async () => {
          expect(await oracleAdapter.assetSources(priceAgg.token)).to.equal(
            priceAgg.agg
          );
        });
      });

      it("should register ERC20 Allocation with TvlManager", async () => {
        const tvlManagerAddress = await alphaDeployment.tvlManager();
        const tvlManager = await ethers.getContractAt(
          "TvlManager",
          tvlManagerAddress
        );
        expect(
          await tvlManager.isAssetAllocationRegistered(["erc20Allocation"])
        ).to.be.true;
      });
    });
  });
});
