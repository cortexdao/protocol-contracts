const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS, ZERO_ADDRESS, bytes32 } = require("../utils/helpers");
const { deployMockContract } = waffle;

describe("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;

  // contract factories
  let AlphaDeployment;

  // mocked contracts
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

  before("Register Safes", async () => {
    [deployer, emergencySafe, adminSafe, lpSafe] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);

    AlphaDeployment = await ethers.getContractFactory("TestAlphaDeployment");
  });

  it("constructor", async () => {
    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        addressRegistry.address,
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;
    expect(await alphaDeployment.step()).to.equal(1);
  });

  it("deploy_1_MetaPoolToken", async () => {
    const proxyAdminFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdminFactory").abi
    );
    proxyAdminFactory.mock.create.returns(FAKE_ADDRESS);

    const mAptAddress = (await deployMockContract(deployer, [])).address;
    const metaPoolTokenFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("MetaPoolTokenFactory").abi
    );
    metaPoolTokenFactory.mock.create.returns(mAptAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        addressRegistry.address,
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        metaPoolTokenFactory.address, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for ownership check
    await addressRegistry.mock.owner.returns(alphaDeployment.address);

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

    // check mAPT address set properly
    expect(await alphaDeployment.mApt()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_1_MetaPoolToken()).to.not.be.reverted;
    expect(await alphaDeployment.mApt()).to.equal(mAptAddress);
  });

  it("deploy_2_DemoPools", async () => {
    const proxyAdmin = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    await proxyAdmin.mock.upgradeAndCall.returns();
    const proxyAdminFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdminFactory").abi
    );
    proxyAdminFactory.mock.create.returns(proxyAdmin.address);

    const demoPoolAddress = (await deployMockContract(deployer, [])).address;
    const poolTokenV1Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV1Factory").abi
    );
    poolTokenV1Factory.mock.create.returns(demoPoolAddress);

    const poolTokenV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2Factory").abi
    );
    poolTokenV2Factory.mock.create.returns(FAKE_ADDRESS);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        addressRegistry.address,
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(2);

    // for deployed address check
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(alphaDeployment.address);

    // check for address registrations
    // DAI
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("daiDemoPool"), demoPoolAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_2_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("daiDemoPool"), demoPoolAddress)
      .returns();
    // USDC
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdcDemoPool"), demoPoolAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_2_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdcDemoPool"), demoPoolAddress)
      .returns();
    // USDT
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdtDemoPool"), demoPoolAddress)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_2_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("usdtDemoPool"), demoPoolAddress)
      .returns();

    // check mAPT address set properly
    expect(await alphaDeployment.daiDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_2_DemoPools()).to.not.be.reverted;
    expect(await alphaDeployment.daiDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(demoPoolAddress);
  });

  it("deploy_3_TvlManager", async () => {
    const erc20AllocationFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("Erc20AllocationFactory").abi
    );
    const erc20AllocationAddress = (await deployMockContract(deployer, []))
      .address;
    await erc20AllocationFactory.mock.create.returns(erc20AllocationAddress);

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
        addressRegistry.address,
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        erc20AllocationFactory.address, // erc20 allocation factory
        tvlManagerFactory.address, // tvl manager factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(3);

    // for ownership check
    await addressRegistry.mock.owner.returns(alphaDeployment.address);

    // check for address registrations
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("tvlManager"), tvlManager.address)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_TvlManager()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await addressRegistry.mock.registerAddress
      .withArgs(bytes32("tvlManager"), tvlManager.address)
      .returns();

    // check TVL Manager address set properly
    expect(await alphaDeployment.tvlManager()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_3_TvlManager()).to.not.be.reverted;
    expect(await alphaDeployment.tvlManager()).to.equal(tvlManager.address);
  });

  it("handoffOwnership", async () => {
    const alphaDeployment = await AlphaDeployment.deploy(
      addressRegistry.address,
      FAKE_ADDRESS, // proxy admin factory
      FAKE_ADDRESS, // proxy factory
      FAKE_ADDRESS, // mAPT factory
      FAKE_ADDRESS, // pool token v1 factory
      FAKE_ADDRESS, // pool token v2 factory
      FAKE_ADDRESS, // erc20 allocation factory
      FAKE_ADDRESS, // tvl manager factory
      FAKE_ADDRESS, // oracle adapter factory
      FAKE_ADDRESS // lp account factory
    );

    // any ownable contract here will do; ProxyAdmin is a simple one
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy();
    expect(await proxyAdmin.owner()).to.equal(deployer.address);

    await proxyAdmin.transferOwnership(alphaDeployment.address);
    expect(await proxyAdmin.owner()).to.equal(alphaDeployment.address);
    await alphaDeployment
      .connect(deployer)
      .handoffOwnership(proxyAdmin.address);
    expect(await proxyAdmin.owner()).to.equal(deployer.address);
  });
});
