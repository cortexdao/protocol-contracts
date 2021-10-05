const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const {
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
  getDeployedAddress,
} = require("../utils/helpers");
const {
  AGG_MAP: { MAINNET: AGGS },
} = require("../utils/constants");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

describe("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
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

  let poolProxyAdminAddress;

  let alphaDeployment;
  let addressRegistry;

  before("Attach to Mainnet Address Registry", async () => {
    [deployer] = await ethers.getSigners();

    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      MAINNET_ADDRESS_REGISTRY
    );
  });

  before("Transfer necessary ownerships to Admin Safe", async () => {
    const adminSafeAddress = getDeployedAddress("AdminSafe", "MAINNET");
    adminSafe = await ethers.getContractAt(
      "IGnosisModuleManager",
      adminSafeAddress
    );
    const addressRegistryProxyAdminAddress = getDeployedAddress(
      "AddressRegistryProxyAdmin",
      "MAINNET"
    );
    const addressRegistryProxyAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      addressRegistryProxyAdminAddress
    );
    const addressRegistryDeployerAddress = await addressRegistryProxyAdmin.owner();
    const addressRegistryDeployer = await impersonateAccount(
      addressRegistryDeployerAddress
    );
    await forciblySendEth(
      addressRegistryDeployer.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    await addressRegistryProxyAdmin
      .connect(addressRegistryDeployer)
      .transferOwnership(adminSafe.address);

    poolProxyAdminAddress = getDeployedAddress(
      "PoolTokenProxyAdmin",
      "MAINNET"
    );
    const poolProxyAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      poolProxyAdminAddress
    );
    const poolDeployerAddress = await poolProxyAdmin.owner();
    const poolDeployer = await impersonateAccount(poolDeployerAddress);
    await forciblySendEth(
      poolDeployer.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    await poolProxyAdmin
      .connect(poolDeployer)
      .transferOwnership(adminSafe.address);
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
    before("Register deployer module", async () => {
      await forciblySendEth(
        adminSafe.address,
        tokenAmountToBigNumber(10),
        deployer.address
      );

      const adminSafeSigner = await impersonateAccount(adminSafe.address);
      await adminSafe
        .connect(adminSafeSigner)
        .enableModule(alphaDeployment.address);

      expect(await adminSafe.getModules()).to.deep.equals([
        alphaDeployment.address,
      ]);
    });

    describe("Step 0: Upgrade AddressRegistry", () => {
      it("new addresses should not be registered before upgrade", async () => {
        await expect(addressRegistry.emergencySafeAddress()).to.be.reverted;
      });

      it("should update step number", async () => {
        await alphaDeployment.deploy_0_AddressRegistryV2_upgrade();
        expect(await alphaDeployment.step()).to.equal(1);
      });

      it("new addresses should be registered after upgrade", async () => {
        await expect(addressRegistry.emergencySafeAddress()).to.not.be.reverted;
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
    });

    describe("Step 2: Deploy PoolTokenV2 logic contract", () => {
      before("Run step 2", async () => {
        await alphaDeployment.deploy_2_PoolTokenV2_logic();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(3);
      });

      it("should initialize the logic contract so it cannot be stolen", async () => {
        const poolTokenV2Logic = await ethers.getContractAt(
          "PoolTokenV2",
          await alphaDeployment.poolTokenV2()
        );

        expect(await poolTokenV2Logic.proxyAdmin()).to.equal(
          poolProxyAdminAddress
        );
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
          let addressFromRegistry;
          let demoPool;

          it("should register the pool with the address registry", async () => {
            addressFromRegistry = await addressRegistry.getAddress(
              bytes32(poolData.addressId)
            );
            expect(addressFromRegistry).to.equal(
              await alphaDeployment[poolData.variable]()
            );
          });

          it("should transfer the proxy admin owner to the Admin Safe", async () => {
            demoPool = await ethers.getContractAt(
              "PoolTokenV2",
              addressFromRegistry
            );

            const poolProxyAdmin = await ethers.getContractAt(
              "ProxyAdmin",
              await demoPool.proxyAdmin()
            );
            expect(await poolProxyAdmin.owner()).to.equal(adminSafe.address);
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
      let lpAccount;

      before("Run step 5", async () => {
        await alphaDeployment.deploy_5_LpAccount();
        lpAccountAddress = await alphaDeployment.lpAccount();
        lpAccount = await ethers.getContractAt("LpAccount", lpAccountAddress);
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(6);
      });

      it("should register the LpAccount address", async () => {
        expect(await addressRegistry.lpAccountAddress()).to.equal(
          lpAccountAddress
        );
      });

      it("should transfer the proxy admin owner to the Admin Safe", async () => {
        const poolProxyAdmin = await ethers.getContractAt(
          "ProxyAdmin",
          await lpAccount.proxyAdmin()
        );
        expect(await poolProxyAdmin.owner()).to.equal(adminSafe.address);
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
    });

    describe("Step 7: Upgrade user pools", () => {
      const pools = [
        "DAI_PoolTokenProxy",
        "USDC_PoolTokenProxy",
        "USDC_PoolTokenProxy",
      ];

      before("Run step 7", async () => {
        await alphaDeployment.deploy_7_PoolTokenV2_upgrade();
      });

      it("should update step number", async () => {
        expect(await alphaDeployment.step()).to.equal(8);
      });

      pools.forEach((poolProxyName) => {
        describe(poolProxyName.split("_")[0], async () => {
          it("should have v2 pool functions and v2 variables initialized", async () => {
            const poolAddress = getDeployedAddress(poolProxyName, "MAINNET");
            const pool = await ethers.getContractAt("PoolTokenV2", poolAddress);

            expect(await pool.reservePercentage()).to.equal(5);
          });
        });
      });
    });
  });
});
