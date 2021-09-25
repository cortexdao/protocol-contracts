const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
  getDeployedAddress,
} = require("../utils/helpers");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

describe.only("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;

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
  let oracleAdapterFactory;
  let lpAccountFactory;

  let poolProxyAdminAddress;

  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

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

  it("constructor", async () => {
    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        proxyFactory.address, // proxy factory
        addressRegistryV2Factory.address, // address registry v2 factory
        metaPoolTokenFactory.address, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        tvlManagerFactory.address, // tvl manager factory
        oracleAdapterFactory.address, // oracle adapter factory
        lpAccountFactory.address // lp account factory
      )
    ).to.not.be.reverted;
    expect(await alphaDeployment.step()).to.equal(0);
  });

  it("deploy all", async () => {
    const alphaDeployment = await AlphaDeployment.deploy(
      proxyAdminFactory.address, // proxy admin factory
      proxyFactory.address, // proxy factory
      addressRegistryV2Factory.address, // address registry v2 factory
      metaPoolTokenFactory.address, // mAPT factory
      poolTokenV1Factory.address, // pool token v1 factory
      poolTokenV2Factory.address, // pool token v2 factory
      tvlManagerFactory.address, // tvl manager factory
      oracleAdapterFactory.address, // oracle adapter factory
      lpAccountFactory.address // lp account factory
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

    expect(await adminSafe.getModules()).to.deep.equals([
      alphaDeployment.address,
    ]);

    await expect(addressRegistry.emergencySafeAddress()).to.be.reverted;
    await alphaDeployment.deploy_0_AddressRegistryV2_upgrade();
    await expect(addressRegistry.emergencySafeAddress()).to.not.be.reverted;

    await alphaDeployment.deploy_1_MetaPoolToken();
    expect(await addressRegistry.mAptAddress()).to.equal(
      await alphaDeployment.mApt()
    );

    await alphaDeployment.deploy_2_PoolTokenV2_logic();
    const poolTokenV2Logic = await ethers.getContractAt(
      "PoolTokenV2",
      await alphaDeployment.poolTokenV2()
    );
    // check that the logic contract was initialized
    expect(await poolTokenV2Logic.proxyAdmin()).to.equal(poolProxyAdminAddress);

    const tx = await alphaDeployment.deploy_3_DemoPools();
    console.log(tx);

    const daiDemoPoolAddress = await addressRegistry.getAddress(
      bytes32("daiDemoPool")
    );
    expect(daiDemoPoolAddress).to.equal(await alphaDeployment.daiDemoPool());

    const daiDemoPool = await ethers.getContractAt(
      "PoolTokenV2",
      daiDemoPoolAddress
    );
    //await daiDemoPool.reservePercentage();

    expect(await addressRegistry.getAddress(bytes32("usdcDemoPool"))).to.equal(
      await alphaDeployment.usdcDemoPool()
    );
    expect(await addressRegistry.getAddress(bytes32("usdtDemoPool"))).to.equal(
      await alphaDeployment.usdtDemoPool()
    );
    // await alphaDeployment.deploy_4_TvlManager();
    // await alphaDeployment.deploy_5_OracleAdapter();
    // await alphaDeployment.deploy_6_LpAccount();
    // await alphaDeployment.deploy_7_PoolTokenV2_upgrade();
  });
});
