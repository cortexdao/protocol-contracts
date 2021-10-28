const { smock } = require("@defi-wonderland/smock");
const chai = require("chai");
const { expect } = chai;
chai.use(smock.matchers);
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS, ZERO_ADDRESS, bytes32 } = require("../utils/helpers");

const POOL_PROXY_ADMIN = "0x7965283631253DfCb71Db63a60C656DEDF76234f";
const MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN =
  "0xFbF6c940c1811C3ebc135A9c4e39E042d02435d1";
const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

const CALL = 0;

async function encodeRegisterAddress(contractIdString, contractAddress) {
  const AddressRegistryV2 = await ethers.getContractFactory(
    "AddressRegistryV2"
  );
  const data = AddressRegistryV2.interface.encodeFunctionData(
    "registerAddress(bytes32,address)",
    [bytes32(contractIdString), contractAddress]
  );
  return data;
}

describe("Contract: AlphaDeployment", () => {
  // signers
  let emergencySafe;
  let lpSafe;

  // contract factories
  let AlphaDeployment;

  // mocked contracts
  // note: we use `smock` not `waffle`
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
    addressRegistryProxyAdmin = await smock.fake("ProxyAdmin", {
      address: MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN,
    });
    expect(addressRegistryProxyAdmin.address).to.equal(
      MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN
    );
    addressRegistry = await smock.fake("AddressRegistryV2", {
      address: MAINNET_ADDRESS_REGISTRY,
    });
    expect(addressRegistry.address).to.equal(MAINNET_ADDRESS_REGISTRY);
  });

  before("Register Safes", async () => {
    [, emergencySafe, lpSafe] = await ethers.getSigners();

    addressRegistry.emergencySafeAddress.returns(emergencySafe.address);
    addressRegistry.getAddress
      .whenCalledWith(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    addressRegistry.lpSafeAddress.returns(lpSafe.address);
    addressRegistry.getAddress
      .whenCalledWith(bytes32("lpSafe"))
      .returns(lpSafe.address);

    // mock the Admin Safe to allow module function calls
    adminSafe = await smock.fake("IGnosisModuleManager");
    adminSafe.execTransactionFromModule.returns(true);
    // register the address
    addressRegistry.adminSafeAddress.returns(adminSafe.address);
    addressRegistry.getAddress
      .whenCalledWith(bytes32("adminSafe"))
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
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;
    expect(await alphaDeployment.step()).to.equal(0);
  });

  it("deploy_0_AddressRegistryV2_upgrade", async () => {
    // mock logic storage initialize
    const logicV2 = await smock.fake("AddressRegistryV2");
    logicV2.initialize.returns();
    // mock the factory create
    const addressRegistryV2Factory = await smock.fake(
      "AddressRegistryV2Factory"
    );
    addressRegistryV2Factory.create.returns(logicV2.address);
    // mock the upgrade call
    addressRegistryProxyAdmin.upgrade.returns();

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        addressRegistryV2Factory.address, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for ownership check:
    addressRegistry.owner.returns(adminSafe.address);
    addressRegistryProxyAdmin.owner.returns(adminSafe.address);

    await alphaDeployment.deploy_0_AddressRegistryV2_upgrade();
  });

  it("deploy_1_MetaPoolToken", async () => {
    const mAptAddress = (await smock.fake([])).address;
    const metaPoolTokenFactory = await smock.fake("MetaPoolTokenFactory");
    metaPoolTokenFactory.create.returns(mAptAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        metaPoolTokenFactory.address, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(1);

    // for ownership check
    addressRegistry.owner.returns(adminSafe.address);

    expect(await alphaDeployment.mApt()).to.equal(ZERO_ADDRESS);

    await expect(alphaDeployment.deploy_1_MetaPoolToken()).to.not.be.reverted;

    // check address set properly
    expect(await alphaDeployment.mApt()).to.equal(mAptAddress);

    // check for address registration
    const data = await encodeRegisterAddress("mApt", mAptAddress);
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );

    // check pool proxy admin was used to create mApt
    expect(metaPoolTokenFactory.create.getCall(0).args.proxyAdmin).to.equal(
      POOL_PROXY_ADMIN
    );
  });

  it("deploy_2_PoolTokenV2_logic", async () => {
    // need to mock logic storage init
    const logicV2 = await smock.fake("PoolTokenV2");
    logicV2.initialize.returns();
    // mock the v2 logic create
    const poolTokenV2Factory = await smock.fake("PoolTokenV2Factory");
    poolTokenV2Factory.create.returns(logicV2.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(2);

    expect(await alphaDeployment.poolTokenV2()).to.equal(ZERO_ADDRESS);

    await expect(alphaDeployment.deploy_2_PoolTokenV2_logic()).to.not.be
      .reverted;

    // check address set properly
    expect(await alphaDeployment.poolTokenV2()).to.equal(logicV2.address);
  });

  it("deploy_3_DemoPools", async () => {
    // mock the proxy admin create and owner transfer
    const proxyAdmin = await smock.fake("ProxyAdmin");
    proxyAdmin.changeProxyAdmin.returns();
    const proxyAdminFactory = await smock.fake("ProxyAdminFactory");
    await proxyAdminFactory.create.returns(proxyAdmin.address);

    // mock the v1 proxy create
    const demoPoolAddress = (await smock.fake([])).address;
    const poolTokenV1Factory = await smock.fake("PoolTokenV1Factory");
    poolTokenV1Factory.create.returns(demoPoolAddress);

    // need to mock logic storage init
    const logicV2 = await smock.fake("PoolTokenV2");
    logicV2.initialize.returns();
    // mock the v2 logic create
    const poolTokenV2Factory = await smock.fake("PoolTokenV2Factory");
    poolTokenV2Factory.create.returns(logicV2.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(3);

    // for deployed address check
    const mAptAddress = (await smock.fake([])).address;
    addressRegistry.getAddress
      .whenCalledWith(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    addressRegistry.owner.returns(adminSafe.address);

    // need to mock the upgrade
    proxyAdmin.upgradeAndCall.returns();

    expect(await alphaDeployment.daiDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(ZERO_ADDRESS);

    await expect(alphaDeployment.deploy_3_DemoPools()).to.not.be.reverted;

    // check address set properly
    expect(await alphaDeployment.daiDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(demoPoolAddress);

    // check for address registrations
    // DAI
    let data = await encodeRegisterAddress("daiDemoPool", demoPoolAddress);
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );
    // USDC
    data = await encodeRegisterAddress("usdcDemoPool", demoPoolAddress);
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );
    // USDT
    data = await encodeRegisterAddress("usdtDemoPool", demoPoolAddress);
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );

    // check pool proxy admin was used to create demo pools
    expect(proxyAdmin.changeProxyAdmin.getCall(0).args.newAdmin).to.equal(
      POOL_PROXY_ADMIN
    );
    expect(proxyAdmin.changeProxyAdmin.getCall(1).args.newAdmin).to.equal(
      POOL_PROXY_ADMIN
    );
    expect(proxyAdmin.changeProxyAdmin.getCall(2).args.newAdmin).to.equal(
      POOL_PROXY_ADMIN
    );
  });

  it("deploy_4_TvlManager", async () => {
    // mock erc20 allocation
    const erc20AllocationFactory = await smock.fake("Erc20AllocationFactory");
    const erc20Allocation = await smock.fake("Erc20Allocation");
    erc20AllocationFactory.create.returns(erc20Allocation.address);
    // mock tvl manager
    const tvlManagerFactory = await smock.fake("TvlManagerFactory");
    const tvlManager = await smock.fake("TvlManager");
    tvlManagerFactory.create.returns(tvlManager.address);
    // mock registering erc20 allocation through Admin Safe
    const TvlManager = await ethers.getContractFactory("TvlManager");
    const encodedRegisterAllocation = TvlManager.interface.encodeFunctionData(
      "registerAssetAllocation(address)",
      [erc20Allocation.address]
    );
    adminSafe.execTransactionFromModule
      .whenCalledWith(tvlManager.address, 0, encodedRegisterAllocation, CALL)
      .returns(true);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        tvlManagerFactory.address, // tvl manager factory
        erc20AllocationFactory.address, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(4);

    // for ownership check
    addressRegistry.owner.returns(adminSafe.address);

    expect(await alphaDeployment.tvlManager()).to.equal(ZERO_ADDRESS);

    await expect(alphaDeployment.deploy_4_TvlManager()).to.not.be.reverted;

    // check TVL Manager address set properly
    expect(await alphaDeployment.tvlManager()).to.equal(tvlManager.address);

    // check for address registrations
    // 1. TvlManager
    let data = await encodeRegisterAddress("tvlManager", tvlManager.address);
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );
    // 2. Erc20Allocation
    data = await encodeRegisterAddress(
      "erc20Allocation",
      erc20Allocation.address
    );
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );
  });

  it("deploy_5_LpAccount", async () => {
    const lpAccountAddress = (await smock.fake([])).address;
    const lpAccountFactory = await smock.fake("LpAccountFactory");
    lpAccountFactory.create.returns(lpAccountAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        lpAccountFactory.address // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(5);

    // for deployed address check:
    const mAptAddress = (await smock.fake([])).address;
    addressRegistry.getAddress
      .whenCalledWith(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    addressRegistry.owner.returns(adminSafe.address);

    expect(await alphaDeployment.lpAccount()).to.equal(ZERO_ADDRESS);

    await expect(alphaDeployment.deploy_5_LpAccount()).to.not.be.reverted;

    // check address set properly
    expect(await alphaDeployment.lpAccount()).to.equal(lpAccountAddress);

    // check for address registrations
    const data = await encodeRegisterAddress("lpAccount", lpAccountAddress);
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );

    // check pool proxy admin was used to create mApt
    expect(lpAccountFactory.create.getCall(0).args.proxyAdmin).to.equal(
      POOL_PROXY_ADMIN
    );
  });

  it("deploy_6_OracleAdapter", async () => {
    const oracleAdapterFactory = await smock.fake("OracleAdapterFactory");
    const oracleAdapter = await smock.fake("OracleAdapter");
    oracleAdapterFactory.create.returns(oracleAdapter.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        oracleAdapterFactory.address, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(6);

    // for deployed address check:
    // 1. deploy and register mock mAPT
    const mAptAddress = (await smock.fake([])).address;
    addressRegistry.getAddress
      .whenCalledWith(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);
    // 2. deploy and register mock LpAccount
    const lpAccountAddress = (await smock.fake([])).address;
    addressRegistry.getAddress
      .whenCalledWith(bytes32("lpAccount"))
      .returns(lpAccountAddress);
    await alphaDeployment.testSetLpAccount(lpAccountAddress);
    // 3. deploy and register mock TvlManager
    const tvlManagerAddress = (await smock.fake([])).address;
    addressRegistry.getAddress
      .whenCalledWith(bytes32("tvlManager"))
      .returns(tvlManagerAddress);
    await alphaDeployment.testSetTvlManager(tvlManagerAddress);
    // 4. deploy and register mock Erc20Allocation
    const erc20AllocationAddress = (await smock.fake([])).address;
    addressRegistry.getAddress
      .whenCalledWith(bytes32("erc20Allocation"))
      .returns(erc20AllocationAddress);
    await alphaDeployment.testSetErc20Allocation(erc20AllocationAddress);

    // for ownership check
    addressRegistry.owner.returns(adminSafe.address);

    expect(await alphaDeployment.oracleAdapter()).to.equal(ZERO_ADDRESS);

    await expect(alphaDeployment.deploy_6_OracleAdapter()).to.not.be.reverted;

    // check Oracle Adapter address set properly
    expect(await alphaDeployment.oracleAdapter()).to.equal(
      oracleAdapter.address
    );

    // check for address registrations
    const data = await encodeRegisterAddress(
      "oracleAdapter",
      oracleAdapter.address
    );
    expect(adminSafe.execTransactionFromModule).to.have.been.calledWith(
      addressRegistry.address,
      0,
      data,
      CALL
    );
  });
});
