const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  ZERO_ADDRESS,
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
} = require("../utils/helpers");
const { deployMockContract } = waffle;

const MAINNET_POOL_DEPLOYER = "0x6eaf0ab3455787ba10089800db91f11fdf6370be";
const MAINNET_ADDRESS_REGISTRY_DEPLOYER =
  "0x720edBE8Bb4C3EA38F370bFEB429D715b48801e3";
const MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN =
  "0xFbF6c940c1811C3ebc135A9c4e39E042d02435d1";
const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

describe("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;
  let adminSafeSigner; // adminSafe itself has to be mocked

  // contract factories
  let AlphaDeployment;

  // mocked contracts
  let adminSafe;
  let addressRegistry;
  let addressRegistryProxyAdmin;

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
    // In particular, we need to reset the Mainnet accounts, otherwise
    // this will cause leakage into other test suites.  Doing a `beforeEach`
    // instead is viable but makes tests noticeably slower.
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before("Setup mocks with Mainnet addresses", async () => {
    [deployer] = await ethers.getSigners();

    const owner = await impersonateAccount(MAINNET_ADDRESS_REGISTRY_DEPLOYER);
    await forciblySendEth(
      owner.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    // The Mainnet registry proxy admin was created on the first transaction
    // from the registry deployer.
    // Step 0 of alpha deployment depends on the existence of a proxy admin
    // at the Mainnet address.
    addressRegistryProxyAdmin = await deployMockContract(
      owner,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    expect(addressRegistryProxyAdmin.address).to.equal(
      MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN
    );
    // Set the nonce to 3 before deploying the mock contract with the
    // Mainnet registry deployer; this will ensure the mock address
    // matches Mainnet.
    await hre.network.provider.send("hardhat_setNonce", [
      MAINNET_ADDRESS_REGISTRY_DEPLOYER,
      "0x3",
    ]);
    addressRegistry = await deployMockContract(
      owner,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
    expect(addressRegistry.address).to.equal(MAINNET_ADDRESS_REGISTRY);
  });

  before("Register Safes", async () => {
    [, emergencySafe, lpSafe] = await ethers.getSigners();

    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("lpSafe"))
      .returns(lpSafe.address);

    // mock the Admin Safe to allow module function calls
    adminSafe = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IGnosisModuleManager").abi
    );
    await adminSafe.mock.execTransactionFromModule.returns(true);
    // create a signer for the same address
    adminSafeSigner = await impersonateAccount(adminSafe.address);
    // register the address
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);

    AlphaDeployment = await ethers.getContractFactory("TestAlphaDeployment");
  });

  it("constructor", async () => {
    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;
    expect(await alphaDeployment.step()).to.equal(0);
  });

  it("deploy_0_AddressRegistryV2_upgrade", async () => {
    // mock logic storage initialize
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
    await logicV2.mock.initialize.returns();
    // mock the factory create
    const addressRegistryV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("AddressRegistryV2Factory").abi
    );
    await addressRegistryV2Factory.mock.create.returns(logicV2.address);
    // mock the upgrade call
    await addressRegistryProxyAdmin.mock.upgrade.returns();

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        addressRegistryV2Factory.address, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for ownership check:
    await addressRegistry.mock.owner.returns(adminSafe.address);
    await addressRegistryProxyAdmin.mock.owner.returns(adminSafe.address);

    await alphaDeployment.deploy_0_AddressRegistryV2_upgrade();
  });

  it("deploy_1_MetaPoolToken", async () => {
    const proxyAdminFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdminFactory").abi
    );
    const proxyAdmin = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    await proxyAdmin.mock.transferOwnership.returns();
    proxyAdminFactory.mock.create.returns(proxyAdmin.address);

    const mAptAddress = (await deployMockContract(deployer, [])).address;
    const metaPoolTokenFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("MetaPoolTokenFactory").abi
    );
    metaPoolTokenFactory.mock.create.returns(mAptAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        metaPoolTokenFactory.address, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(1);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registration
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("mApt"), mAptAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_1_MetaPoolToken()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("mApt"), mAptAddress)
      .returns();

    // check address set properly
    expect(await alphaDeployment.mApt()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_1_MetaPoolToken()).to.not.be.reverted;
    expect(await alphaDeployment.mApt()).to.equal(mAptAddress);
  });

  it("deploy_2_PoolTokenV2_logic", async () => {
    // need to mock logic storage init
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2").abi
    );
    await logicV2.mock.initialize.returns();
    // mock the v2 logic create
    const poolTokenV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2Factory").abi
    );
    poolTokenV2Factory.mock.create.returns(logicV2.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(2);

    // check address set properly
    expect(await alphaDeployment.poolTokenV2()).to.equal(ZERO_ADDRESS);
    // await expect(alphaDeployment.deploy_2_PoolTokenV2_logic()).to.not.be
    //   .reverted;
    await alphaDeployment.deploy_2_PoolTokenV2_logic();
    expect(await alphaDeployment.poolTokenV2()).to.equal(logicV2.address);
  });

  it("deploy_3_DemoPools", async () => {
    // mock the proxy admin create and owner transfer
    const proxyAdmin = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    await proxyAdmin.mock.transferOwnership.returns();
    const proxyAdminFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdminFactory").abi
    );
    proxyAdminFactory.mock.create.returns(proxyAdmin.address);

    // mock the v1 proxy create
    const demoPoolAddress = (await deployMockContract(deployer, [])).address;
    const poolTokenV1Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV1Factory").abi
    );
    poolTokenV1Factory.mock.create.returns(demoPoolAddress);

    // need to mock logic storage init
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2").abi
    );
    await logicV2.mock.initialize.returns();
    // mock the v2 logic create
    const poolTokenV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2Factory").abi
    );
    poolTokenV2Factory.mock.create.returns(logicV2.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(3);

    // for deployed address check
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // need to mock the upgrade
    await proxyAdmin.mock.upgradeAndCall.returns();

    // check for address registrations
    // DAI
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("daiDemoPool"), demoPoolAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("daiDemoPool"), demoPoolAddress)
      .returns();
    // USDC
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdcDemoPool"), demoPoolAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdcDemoPool"), demoPoolAddress)
      .returns();
    // USDT
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdtDemoPool"), demoPoolAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdtDemoPool"), demoPoolAddress)
      .returns();

    // check address set properly
    expect(await alphaDeployment.daiDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_3_DemoPools()).to.not.be.reverted;
    expect(await alphaDeployment.daiDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(demoPoolAddress);
  });

  it("deploy_4_TvlManager", async () => {
    const tvlManagerFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("TvlManagerFactory").abi
    );
    const tvlManager = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("TvlManager").abi
    );
    await tvlManagerFactory.mock.create.returns(tvlManager.address);
    await tvlManager.mock.registerAssetAllocation.returns();

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        tvlManagerFactory.address, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(4);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registrations
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("tvlManager"), tvlManager.address)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_4_TvlManager()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("tvlManager"), tvlManager.address)
      .returns();

    // check TVL Manager address set properly
    expect(await alphaDeployment.tvlManager()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_4_TvlManager()).to.not.be.reverted;
    expect(await alphaDeployment.tvlManager()).to.equal(tvlManager.address);
  });

  it("deploy_5_OracleAdapter", async () => {
    const oracleAdapterFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapterFactory").abi
    );
    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapter").abi
    );
    await oracleAdapterFactory.mock.create.returns(oracleAdapter.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        oracleAdapterFactory.address, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(5);

    // for deployed address check:
    // 1. deploy and register mock mAPT
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);
    // 2. deploy and register mock TvlManager
    const tvlManagerAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManagerAddress);
    await alphaDeployment.testSetTvlManager(tvlManagerAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registrations
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("oracleAdapter"), oracleAdapter.address)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_5_OracleAdapter()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("oracleAdapter"), oracleAdapter.address)
      .returns();

    // check Oracle Adapter address set properly
    expect(await alphaDeployment.oracleAdapter()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_5_OracleAdapter()).to.not.be.reverted;
    expect(await alphaDeployment.oracleAdapter()).to.equal(
      oracleAdapter.address
    );
  });

  it("deploy_6_LpAccount", async () => {
    const proxyAdmin = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    await proxyAdmin.mock.transferOwnership.returns();
    const proxyAdminFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdminFactory").abi
    );
    proxyAdminFactory.mock.create.returns(proxyAdmin.address);

    const lpAccountAddress = (await deployMockContract(deployer, [])).address;
    const lpAccountFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("LpAccountFactory").abi
    );
    lpAccountFactory.mock.create.returns(lpAccountAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        lpAccountFactory.address // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(6);

    // for deployed address check:
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registration
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("lpAccount"), lpAccountAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_6_LpAccount()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("lpAccount"), lpAccountAddress)
      .returns();

    // check address set properly
    expect(await alphaDeployment.lpAccount()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_6_LpAccount()).to.not.be.reverted;
    expect(await alphaDeployment.lpAccount()).to.equal(lpAccountAddress);
  });

  it("deploy_7_PoolTokenV2_upgrade", async () => {
    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(7);

    // for deployed address check:
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2").abi
    );
    await alphaDeployment.testSetPoolTokenV2(logicV2.address);

    // for ownership checks:
    // 1. Make deployment contract the owner of the Address Registry
    await addressRegistry.mock.owner.returns(alphaDeployment.address);
    const poolDeployer = await impersonateAccount(MAINNET_POOL_DEPLOYER);
    await forciblySendEth(
      poolDeployer.address,
      tokenAmountToBigNumber(1),
      deployer.address
    );
    const proxyAdmin = await deployMockContract(
      poolDeployer,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    // proxy admin was created via the first transaction on Mainnet
    // of the pool deployer, so this mock contract should have the
    // same address
    expect(await alphaDeployment.POOL_PROXY_ADMIN()).to.equal(
      proxyAdmin.address
    );
    // 2. Make deployment contract the owner of the pool proxy admin
    await proxyAdmin.mock.owner.returns(alphaDeployment.address);

    // mock the upgrade calls
    await proxyAdmin.mock.upgradeAndCall.revertsWithReason("WRONG_ARGS");
    const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
    const initData = PoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [addressRegistry.address]
    );
    const DAI_POOL_PROXY = await alphaDeployment.DAI_POOL_PROXY();
    await proxyAdmin.mock.upgradeAndCall
      .withArgs(DAI_POOL_PROXY, logicV2.address, initData)
      .returns();
    const USDC_POOL_PROXY = await alphaDeployment.USDC_POOL_PROXY();
    await proxyAdmin.mock.upgradeAndCall
      .withArgs(USDC_POOL_PROXY, logicV2.address, initData)
      .returns();
    const USDT_POOL_PROXY = await alphaDeployment.USDT_POOL_PROXY();
    await proxyAdmin.mock.upgradeAndCall
      .withArgs(USDT_POOL_PROXY, logicV2.address, initData)
      .returns();

    await expect(alphaDeployment.deploy_7_PoolTokenV2_upgrade()).to.not.be
      .reverted;
  });
});
