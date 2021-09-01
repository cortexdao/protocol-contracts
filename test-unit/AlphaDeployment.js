const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS, bytes32 } = require("../utils/helpers");
const { deployMockContract } = waffle;

describe("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;

  // deployed contracts
  let alphaDeployment;

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

  before(async () => {
    [deployer, emergencySafe, adminSafe, lpSafe] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.registerAddress.returns();

    const AlphaDeployment = await ethers.getContractFactory("AlphaDeployment");
    alphaDeployment = await AlphaDeployment.deploy(
      addressRegistry.address,
      FAKE_ADDRESS,
      FAKE_ADDRESS,
      FAKE_ADDRESS,
      FAKE_ADDRESS,
      FAKE_ADDRESS,
      FAKE_ADDRESS,
      FAKE_ADDRESS,
      FAKE_ADDRESS
    );
  });

  it("handoffOwnership", async () => {
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
