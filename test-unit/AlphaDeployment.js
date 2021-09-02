const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS } = require("../utils/helpers");
const { deployMockContract } = waffle;

describe.only("Contract: AlphaDeployment", () => {
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

    // deployed contracts get registered at the end of each step
    await addressRegistry.mock.registerAddress.returns();

    AlphaDeployment = await ethers.getContractFactory("AlphaDeployment");
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
        FAKE_ADDRESS // oracle adapter factory
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

    const metaPoolTokenFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("MetaPoolTokenFactory").abi
    );
    metaPoolTokenFactory.mock.create.returns(FAKE_ADDRESS);

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
        FAKE_ADDRESS // oracle adapter factory
      )
    ).to.not.be.reverted;

    // for ownership check
    await addressRegistry.mock.owner.returns(alphaDeployment.address);

    await alphaDeployment.deploy_1_MetaPoolToken();
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
      FAKE_ADDRESS // oracle adapter factory
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
